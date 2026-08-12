import { ScanResult, ScannedItemCandidate } from '../types';
import { detectCategoryAndIcon } from '../utils/helpers';

export interface BarcodeLookupResult {
  name: string;
  brand?: string;
  category: string;
  categoryIcon: string;
  storageLocation: string;
  estimatedQuantity: number;
  unit: string;
  estimatedDaysUntilExpiry: number;
  imageUrl?: string;
  source: string;
  barcode: string;
}

export interface MhdOcrResult {
  detectedDateIso: string;
  rawText: string;
  confidence: number;
  extractedDateFormatted?: string;
  alternativeReadings?: string[];
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

function getEndpointUrl(path: string): string {
  if (API_BASE_URL) {
    return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
  }
  return path;
}

// 1. Barcode Lookup (Client-side Direct Open Food Facts + Server/AI Fallback)
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) {
    return {
      name: 'Unbekannter Barcode',
      category: 'sonstiges',
      categoryIcon: '📦',
      storageLocation: 'kuehlschrank',
      estimatedQuantity: 1,
      unit: 'Stück',
      estimatedDaysUntilExpiry: 14,
      source: 'Lokal Fallback',
      barcode: '',
    };
  }

  // PASS 1: Direct Client-Side Open Food Facts Query (Works in Native Android Capacitor without Express)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`;
    const offRes = await fetch(offUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (offRes.ok) {
      const data = await offRes.json();
      if (data && data.status === 1 && data.product) {
        const prod = data.product;
        const name =
          prod.product_name_de ||
          prod.product_name ||
          prod.product_name_en ||
          prod.generic_name_de ||
          prod.generic_name ||
          `Produkt (${cleanBarcode})`;

        const brand = prod.brands || prod.brand_owner || '';
        const imageUrl = prod.image_front_url || prod.image_url || prod.image_small_url || undefined;
        const autoCat = detectCategoryAndIcon(name);

        return {
          name,
          brand,
          category: autoCat.category,
          categoryIcon: autoCat.categoryIcon,
          storageLocation: 'kuehlschrank',
          estimatedQuantity: 1,
          unit: 'Stück',
          estimatedDaysUntilExpiry: 14,
          imageUrl,
          source: 'Open Food Facts Direct',
          barcode: cleanBarcode,
        };
      }
    }
  } catch (err) {
    console.warn('Direct Open Food Facts query failed or timed out:', err);
  }

  // PASS 2: Server API Proxy Fallback (if backend running on Cloud / AI Studio)
  try {
    const response = await fetch(getEndpointUrl('/api/barcode-lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: cleanBarcode }),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn('Network error during backend barcode lookup:', err);
  }

  // PASS 3: Local Fallback
  const autoCat = detectCategoryAndIcon(`Gescanntes Produkt (${cleanBarcode})`);
  return {
    name: `Gescanntes Produkt (${cleanBarcode})`,
    brand: '',
    category: autoCat.category,
    categoryIcon: autoCat.categoryIcon,
    storageLocation: 'kuehlschrank',
    estimatedQuantity: 1,
    unit: 'Stück',
    estimatedDaysUntilExpiry: 14,
    source: 'Lokal Fallback',
    barcode: cleanBarcode,
  };
}

// 2. MHD OCR Scan via Gemini Vision (8s timeout)
export async function scanMhdOcr(imageBase64: string, mimeType = 'image/jpeg'): Promise<MhdOcrResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(getEndpointUrl('/api/scan-mhd'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('Network error or 8s timeout during Gemini MHD scan:', err);
  }

  const defaultExp = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  return {
    detectedDateIso: defaultExp,
    rawText: 'MHD manuell gewählt (+14 Tage)',
    confidence: 50,
  };
}

// 3. Fridge Photo AI Scanner
export async function scanFridgePhoto(
  imageBase64: string,
  mimeType = 'image/jpeg',
  locationHint?: string
): Promise<ScanResult> {
  try {
    const response = await fetch(getEndpointUrl('/api/scan-fridge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType, locationHint }),
    });

    if (response.ok) {
      return await response.json();
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Fehler beim Analysieren des Fotos.');
  } catch (err: any) {
    console.warn('Fridge scan error:', err);
    throw new Error(err.message || 'Kühlschrank-Foto konnte nicht analysiert werden.');
  }
}
