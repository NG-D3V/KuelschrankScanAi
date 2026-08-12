import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface NativeScanResult {
  barcode: string;
  format?: string;
  success: boolean;
  cancelled?: boolean;
  errorMessage?: string;
}

/**
 * Checks if ML Kit Native Barcode Scanner is supported on current platform.
 */
export async function isNativeBarcodeScannerAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  try {
    const result = await BarcodeScanner.isSupported();
    return result.supported;
  } catch (err) {
    console.warn('ML Kit Barcode Scanner check error:', err);
    return false;
  }
}

/**
 * Executes a native Google ML Kit barcode scan on Android / iOS.
 */
export async function scanBarcodeWithMlKit(): Promise<NativeScanResult> {
  try {
    // 1. Check native support
    const isSupported = await isNativeBarcodeScannerAvailable();
    if (!isSupported) {
      return {
        barcode: '',
        success: false,
        errorMessage: 'ML Kit Barcode Scanner ist auf diesem Gerät/Browser nicht verfügbar.'
      };
    }

    // 2. Request camera permission
    const permStatus = await BarcodeScanner.requestPermissions();
    if (permStatus.camera !== 'granted' && permStatus.camera !== 'limited') {
      return {
        barcode: '',
        success: false,
        errorMessage: 'Kamerazugriff wurde abgelehnt.'
      };
    }

    // 3. Trigger native scan modal via Google ML Kit
    const result = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.QrCode,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39
      ]
    });

    if (result.barcodes && result.barcodes.length > 0) {
      const scannedCode = result.barcodes[0].rawValue || result.barcodes[0].displayValue || '';
      
      // Haptic feedback on scan success
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch (e) {}

      return {
        barcode: scannedCode,
        format: result.barcodes[0].format,
        success: true
      };
    }

    return {
      barcode: '',
      success: false,
      cancelled: true
    };
  } catch (err: any) {
    console.warn('ML Kit scan exception:', err);
    return {
      barcode: '',
      success: false,
      errorMessage: err.message || 'Fehler beim ML Kit Barcode Scan'
    };
  }
}
