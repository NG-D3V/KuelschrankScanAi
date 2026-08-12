import { createWorker, Worker } from 'tesseract.js';
import { scanMhdNative } from '../services/nativeTextRecognition';

export interface LocalMhdOcrResult {
  detectedDateIso: string | null;
  rawText: string;
  confidence: number;
  extractedDateFormatted?: string;
  alternativeReadings?: string[];
  scanTimeMs?: number;
  source: string;
}

// Global Cached Tesseract Worker Instance
let cachedTesseractWorker: Worker | null = null;
async function getTesseractWorker(): Promise<Worker> {
  if (!cachedTesseractWorker) {
    cachedTesseractWorker = await createWorker('deu+eng');
  }
  return cachedTesseractWorker;
}

/**
 * Advanced image pre-processing for Dot-Matrix, Inkjet, Laser Engraved & Thin Slash Printed Expiration Dates.
 * Downscales to max 800x600px, applies Unsharp Mask Sharpening and Adaptive Thresholding.
 */
export async function preprocessImageForOcr(
  imageSource: string,
  options: {
    invertColors?: boolean;
    dilateDots?: boolean;
    lineEnhancement?: boolean;
    sharpen?: boolean;
    cropHeightRatio?: number; // e.g. 0.30 for 30% center crop
  } = {}
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSource);
        return;
      }

      // Region of Interest Cropping (if requested)
      let srcX = 0;
      let srcY = 0;
      let srcW = img.width;
      let srcH = img.height;

      if (options.cropHeightRatio && options.cropHeightRatio > 0 && options.cropHeightRatio < 1) {
        srcW = Math.round(img.width * 0.85);
        srcH = Math.round(img.height * options.cropHeightRatio);
        srcX = Math.round((img.width - srcW) / 2);
        srcY = Math.round((img.height - srcH) / 2);
      }

      // Downscale to max 800x600px
      let width = srcW;
      let height = srcH;
      const maxW = 800;
      const maxH = 600;
      if (width > maxW || height > maxH) {
        const scale = Math.min(maxW / width, maxH / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const w = width;
      const h = height;

      // 1. Convert to Grayscale
      const gray = new Float32Array(w * h);
      for (let i = 0; i < d.length; i += 4) {
        let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (options.invertColors) {
          g = 255 - g;
        }
        gray[i / 4] = g;
      }

      // 2. Sharpening Filter (Unsharp Mask 3x3 kernel)
      if (options.sharpen) {
        const sharp = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const val = 5 * gray[idx] - gray[idx - w] - gray[idx + w] - gray[idx - 1] - gray[idx + 1];
            sharp[idx] = Math.min(255, Math.max(0, val));
          }
        }
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            gray[idx] = sharp[idx];
          }
        }
      }

      if (options.lineEnhancement) {
        // Noise Reduction + Adaptive Thresholding
        const smooth = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const windowVals = [
              gray[idx - w - 1], gray[idx - w], gray[idx - w + 1],
              gray[idx - 1],     gray[idx],     gray[idx + 1],
              gray[idx + w - 1], gray[idx + w], gray[idx + w + 1]
            ];
            windowVals.sort();
            smooth[idx] = windowVals[4];
          }
        }

        const integral = new Float64Array(w * h);
        for (let y = 0; y < h; y++) {
          let rowSum = 0;
          for (let x = 0; x < w; x++) {
            rowSum += smooth[y * w + x];
            if (y === 0) {
              integral[y * w + x] = rowSum;
            } else {
              integral[y * w + x] = integral[(y - 1) * w + x] + rowSum;
            }
          }
        }

        const radius = 7;
        const C = 8;

        for (let y = 0; y < h; y++) {
          const y1 = Math.max(0, y - radius);
          const y2 = Math.min(h - 1, y + radius);
          for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - radius);
            const x2 = Math.min(w - 1, x + radius);

            const count = (x2 - x1 + 1) * (y2 - y1 + 1);
            let sum = integral[y2 * w + x2];
            if (x1 > 0) sum -= integral[y2 * w + (x1 - 1)];
            if (y1 > 0) sum -= integral[(y1 - 1) * w + x2];
            if (x1 > 0 && y1 > 0) sum -= integral[(y1 - 1) * w + (x1 - 1)];

            const mean = sum / count;
            const pVal = smooth[y * w + x];
            const v = pVal < mean - C ? 0 : 255;

            const pixelIdx = (y * w + x) * 4;
            d[pixelIdx] = v;
            d[pixelIdx + 1] = v;
            d[pixelIdx + 2] = v;
          }
        }
      } else {
        // Standard Global Threshold
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            let avg = gray[idx];
            const factor = 1.6;
            let v = Math.min(255, Math.max(0, factor * (avg - 128) + 128));
            v = v > 130 ? 255 : 0;

            const pixelIdx = idx * 4;
            d[pixelIdx] = v;
            d[pixelIdx + 1] = v;
            d[pixelIdx + 2] = v;
          }
        }
      }

      // Morphological Dilation
      if (options.dilateDots) {
        const copy = new Uint8ClampedArray(d);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = (y * w + x) * 4;
            if (
              copy[idx] === 0 ||
              copy[((y - 1) * w + x) * 4] === 0 ||
              copy[((y + 1) * w + x) * 4] === 0 ||
              copy[(y * w + (x - 1)) * 4] === 0 ||
              copy[(y * w + (x + 1)) * 4] === 0
            ) {
              d[idx] = 0;
              d[idx + 1] = 0;
              d[idx + 2] = 0;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(imageSource);
    img.src = imageSource;
  });
}

/**
 * Parses OCR raw text to find valid Expiry / MHD dates.
 */
export function extractMhdFromText(text: string): {
  isoDate: string | null;
  formattedDate: string | null;
  score: number;
  alternativeReadings: string[];
} {
  if (!text) return { isoDate: null, formattedDate: null, score: 0, alternativeReadings: [] };

  // 1. Extended Character Normalization
  // Step A: Convert slash variants (\, |, │, ┃) BEFORE converting 'I'/'1's!
  let normalizedText = text
    .replace(/[\\│┃|]/g, '/')
    .replace(/[–—‐]/g, '-')
    .replace(/[·•]/g, '.');

  // Step B: Convert letter misreadings
  normalizedText = normalizedText
    .replace(/[Oo]/g, '0')
    .replace(/[Ii1l]/g, '1')
    .replace(/[S]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ');

  const currentYear = new Date().getFullYear();

  // Pattern 1: Standard numeric dates with optional spaces around separators: e.g. 24/11/26, 24 / 11 / 2026, 24.11.26
  const numericDateRegex = /\b([0-3]?[0-9])\s*[\.\/\-]\s*([0-1]?[0-9])\s*[\.\/\-]\s*(20\d{2}|\d{2})\b/g;
  // Pattern 2: Month-Year only dates MM.YYYY, MM / YYYY, MM/YY
  const monthYearRegex = /\b([0-1]?[0-9])\s*[\.\/\-]\s*(20\d{2}|\d{2})\b/g;

  let bestMatch: { isoDate: string; formattedDate: string; score: number } | null = null;
  const alternatives: string[] = [];

  const hasKeywordNearby = (txt: string, index: number) => {
    const windowText = txt.substring(Math.max(0, index - 35), Math.min(txt.length, index + 35)).toUpperCase();
    return /MHD|EXP|BEST|BEFORE|HALTBAR|BBD|M\.H\.D|BB|USE BY/.test(windowText);
  };

  let match;
  while ((match = numericDateRegex.exec(normalizedText)) !== null) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10);
    let yearStr = match[3];
    let year = parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr, 10);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= currentYear - 1 && year <= currentYear + 15) {
      const dayFormatted = String(day).padStart(2, '0');
      const monthFormatted = String(month).padStart(2, '0');
      const iso = `${year}-${monthFormatted}-${dayFormatted}`;
      const formatted = `${dayFormatted}.${monthFormatted}.${year}`;

      let score = 70;
      if (hasKeywordNearby(normalizedText, match.index)) score += 30; // +30 score for nearby keywords
      if (year >= currentYear) score += 10;

      if (!bestMatch) {
        bestMatch = { isoDate: iso, formattedDate: formatted, score };
      } else if (score > bestMatch.score) {
        if (bestMatch.formattedDate !== formatted) alternatives.push(bestMatch.formattedDate);
        bestMatch = { isoDate: iso, formattedDate: formatted, score };
      } else {
        if (formatted !== bestMatch.formattedDate) alternatives.push(formatted);
      }
    }
  }

  if (!bestMatch || bestMatch.score < 80) {
    while ((match = monthYearRegex.exec(normalizedText)) !== null) {
      let month = parseInt(match[1], 10);
      let yearStr = match[2];
      let year = parseInt(yearStr.length === 2 ? `20${yearStr}` : yearStr, 10);

      if (month >= 1 && month <= 12 && year >= currentYear && year <= currentYear + 15) {
        const lastDay = new Date(year, month, 0).getDate();
        const monthFormatted = String(month).padStart(2, '0');
        const iso = `${year}-${monthFormatted}-${String(lastDay).padStart(2, '0')}`;
        const formatted = `${lastDay}.${monthFormatted}.${year}`;

        let score = 50;
        if (hasKeywordNearby(normalizedText, match.index)) score += 30;

        if (!bestMatch) {
          bestMatch = { isoDate: iso, formattedDate: formatted, score };
        } else if (score > bestMatch.score) {
          if (bestMatch.formattedDate !== formatted) alternatives.push(bestMatch.formattedDate);
          bestMatch = { isoDate: iso, formattedDate: formatted, score };
        } else {
          if (formatted !== bestMatch.formattedDate) alternatives.push(formatted);
        }
      }
    }
  }

  if (bestMatch) {
    return { ...bestMatch, alternativeReadings: Array.from(new Set(alternatives)) };
  }

  return { isoDate: null, formattedDate: null, score: 0, alternativeReadings: [] };
}

/**
 * Main local OCR scanner with Multi-Pass support:
 * Pass 1: Google ML Kit Native Recognition (<500ms)
 * Pass 2: Local Preprocessed Tesseract OCR with Sharpening Filter
 */
export async function scanMhdLocally(imageSource: string): Promise<LocalMhdOcrResult> {
  const startTime = performance.now();

  // Pass 1: Google ML Kit Native Text Recognition (<500ms)
  try {
    const nativeRes = await scanMhdNative(imageSource);
    if (nativeRes.detectedDateIso && nativeRes.confidence >= 70) {
      return {
        detectedDateIso: nativeRes.detectedDateIso,
        rawText: nativeRes.rawText,
        confidence: nativeRes.confidence,
        extractedDateFormatted: nativeRes.extractedDateFormatted,
        alternativeReadings: nativeRes.alternativeReadings,
        scanTimeMs: nativeRes.scanTimeMs,
        source: `⚡ ML Kit (${nativeRes.scanTimeMs} ms)`
      };
    }
  } catch (err) {
    console.warn('Native ML Kit pass skipped or unvailable:', err);
  }

  // Pass 2: Local Preprocessed Tesseract OCR with Sharpening & 30% Center Crop
  try {
    const worker = await getTesseractWorker();

    // 2a: Standard Sharpened Pass
    const imgPass1 = await preprocessImageForOcr(imageSource, { sharpen: true, dilateDots: true, cropHeightRatio: 0.30 });
    const ret1 = await worker.recognize(imgPass1);
    const text1 = ret1.data.text || '';
    let bestExtracted = extractMhdFromText(text1);
    let winningText = text1;

    // 2b: Line Enhancement Pass (if score < 75)
    if (!bestExtracted.isoDate || bestExtracted.score < 75) {
      const imgPass2 = await preprocessImageForOcr(imageSource, { sharpen: true, lineEnhancement: true, cropHeightRatio: 0.30 });
      const ret2 = await worker.recognize(imgPass2);
      const text2 = ret2.data.text || '';
      const extracted2 = extractMhdFromText(text2);

      if (extracted2.score > bestExtracted.score) {
        if (bestExtracted.formattedDate && bestExtracted.formattedDate !== extracted2.formattedDate) {
          extracted2.alternativeReadings.push(bestExtracted.formattedDate);
        }
        bestExtracted = extracted2;
        winningText = text2;
      }
    }

    const scanTimeMs = Math.round(performance.now() - startTime);

    return {
      detectedDateIso: bestExtracted.isoDate,
      rawText: winningText.trim().replace(/\s+/g, ' '),
      confidence: bestExtracted.score,
      extractedDateFormatted: bestExtracted.formattedDate || undefined,
      alternativeReadings: Array.from(new Set(bestExtracted.alternativeReadings)),
      scanTimeMs,
      source: `⚡ Lokaler OCR (${scanTimeMs} ms)`
    };
  } catch (err) {
    console.warn('Fehler bei lokaler MHD OCR Erkennung:', err);
    const scanTimeMs = Math.round(performance.now() - startTime);

    return {
      detectedDateIso: null,
      rawText: '',
      confidence: 0,
      alternativeReadings: [],
      scanTimeMs,
      source: 'Lokaler OCR Fehler'
    };
  }
}
