import { TextRecognition, Script } from '@capacitor-mlkit/text-recognition';
import { extractMhdFromText } from '../utils/localOcr';

export interface NativeTextRecognitionResult {
  detectedDateIso: string | null;
  rawText: string;
  confidence: number;
  extractedDateFormatted?: string;
  alternativeReadings?: string[];
  scanTimeMs: number;
  source: string;
}

/**
 * Executes Google ML Kit Text Recognition on Capacitor Android / iOS.
 * Runs 10-50x faster than cloud APIs (<500ms).
 */
export async function scanMhdNative(imageSource: string): Promise<NativeTextRecognitionResult> {
  const startTime = performance.now();

  try {
    // Call ML Kit Text Recognition with path (dataUrl or local path)
    const result = await TextRecognition.processImage({
      path: imageSource,
      script: Script.Latin,
    });

    const scanTimeMs = Math.round(performance.now() - startTime);

    let combinedText = '';
    if (result && result.text) {
      combinedText = result.text;
    } else if (result && result.blocks) {
      combinedText = result.blocks.map((b) => b.text).join(' ');
    }

    const extracted = extractMhdFromText(combinedText);

    return {
      detectedDateIso: extracted.isoDate,
      rawText: combinedText,
      confidence: extracted.score,
      extractedDateFormatted: extracted.formattedDate || undefined,
      alternativeReadings: extracted.alternativeReadings,
      scanTimeMs,
      source: 'Google ML Kit (Nativ)',
    };
  } catch (err) {
    const scanTimeMs = Math.round(performance.now() - startTime);
    console.warn('Native ML Kit Text Recognition unavailable or failed:', err);
    return {
      detectedDateIso: null,
      rawText: '',
      confidence: 0,
      alternativeReadings: [],
      scanTimeMs,
      source: 'ML Kit Unavailable',
    };
  }
}
