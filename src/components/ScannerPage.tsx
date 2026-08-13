import React, { useState, useRef, useEffect } from 'react';
import { InventoryItem, AppSettings, CategoryType, StorageLocation } from '../types';
import { lookupBarcode, scanFridgePhoto, scanMhdOcr } from '../services/api';
import { isNativeBarcodeScannerAvailable, scanBarcodeWithMlKit } from '../services/nativeBarcodeScanner';
import { scanMhdLocally } from '../utils/localOcr';
import { detectCategoryAndIcon, parseFlexibleDateInput } from '../utils/helpers';
import {
  Camera,
  Upload,
  X,
  Loader2,
  Sparkles,
  Check,
  Barcode,
  MapPin,
  Calendar,
  Crop,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Tag,
  AlertCircle,
  Edit3,
  Zap,
  Plus
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface ScannerPageProps {
  onClose: () => void;
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  settings: AppSettings;
  currentLocations: string[];
  currentGroupId: string;
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  onClose,
  onAddItem,
  settings,
  currentLocations,
  currentGroupId,
}) => {
  // 1: Mode & Location
  // 2: Scan/Input
  // 3: Review Data
  // 4: MHD
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [captureTab, setCaptureTab] = useState<'barcode' | 'photo' | 'manual'>('barcode');
  const [selectedLocation, setSelectedLocation] = useState<string>('Kühlschrank');

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatusText, setAnalysisStatusText] = useState<string>('Analyse läuft...');
  const [manualBarcode, setManualBarcode] = useState('');

  const [hasNativeMlKit, setHasNativeMlKit] = useState<boolean>(false);

  const [productData, setProductData] = useState<{
    name: string;
    brand?: string;
    category: string;
    categoryIcon: string;
    imageUrl?: string;
    source?: string;
    barcode?: string;
  }>({
    name: '',
    category: 'sonstiges',
    categoryIcon: '📦',
  });

  const [mhdDate, setMhdDate] = useState<string>('');
  const [mhdInputText, setMhdInputText] = useState<string>('');
  const [mhdOcrFeedback, setMhdOcrFeedback] = useState<string | null>(null);
  const [mhdAlternativeReadings, setMhdAlternativeReadings] = useState<string[]>([]);
  const [mhdCropImage, setMhdCropImage] = useState<string | null>(null);
  const mhdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    isNativeBarcodeScannerAvailable().then((supported) => {
      setHasNativeMlKit(supported);
    });
  }, []);

  useEffect(() => {
    if (mhdDate) {
      const parts = mhdDate.split('-');
      if (parts.length === 3) {
        setMhdInputText(`${parts[2]}.${parts[1]}.${parts[0]}`);
      }
    }
  }, [mhdDate]);

  const handleMhdTextBlur = () => {
    const parsed = parseFlexibleDateInput(mhdInputText);
    if (parsed.isoDate) {
      setMhdDate(parsed.isoDate);
      if (parsed.formattedText) {
        setMhdInputText(parsed.formattedText);
      }
    }
  };

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (currentLocations && currentLocations.length > 0) {
      setSelectedLocation(currentLocations[0]);
    }
    setMhdDate(new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  }, [currentLocations]);

  const [isMhdLiveCameraActive, setIsMhdLiveCameraActive] = useState(false);
  const mhdVideoRef = useRef<HTMLVideoElement | null>(null);
  const mhdStreamRef = useRef<MediaStream | null>(null);

  const stopMhdLiveCamera = () => {
    if (mhdStreamRef.current) {
      mhdStreamRef.current.getTracks().forEach((track) => track.stop());
      mhdStreamRef.current = null;
    }
    setIsMhdLiveCameraActive(false);
  };

  const startMhdLiveCamera = async () => {
    try {
      stopMhdLiveCamera();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      mhdStreamRef.current = stream;
      setIsMhdLiveCameraActive(true);
    } catch (err) {
      console.warn('Live MHD camera error:', err);
      alert('Kamera konnte nicht gestartet werden. Bitte Kamera-Zugriff erlauben.');
    }
  };

  useEffect(() => {
    if (isMhdLiveCameraActive && mhdStreamRef.current && mhdVideoRef.current) {
      const video = mhdVideoRef.current;
      video.srcObject = mhdStreamRef.current;
      video.play().catch((err) => console.warn('MHD camera video play error:', err));
    }
  }, [isMhdLiveCameraActive]);

  const captureFrameFromMhdLiveCamera = async () => {
    if (!mhdVideoRef.current) return;
    const video = mhdVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const fullDataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Crop center 85% width, 30% height ROI
    const cropped = await cropCenterRegionOfImage(fullDataUrl);
    await processMhdImageOcr(cropped);
  };

  const stopCamera = async () => {
    stopMhdLiveCamera();
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Fehler beim Stoppen der Kamera:', err);
      } finally {
        html5QrCodeRef.current = null;
        setIsCameraActive(false);
      }
    }
  };

  useEffect(() => {
    if (step !== 2 || captureTab !== 'barcode') {
      stopCamera();
    }
  }, [step, captureTab]);

  const handleNativeMlKitScan = async () => {
    setIsAnalyzing(true);
    setAnalysisStatusText('ML Kit Scanner startet...');
    try {
      const res = await scanBarcodeWithMlKit();
      if (res.success && res.barcode) {
        await fetchProductFromBarcode(res.barcode);
      } else if (res.errorMessage) {
        alert(res.errorMessage);
        setIsAnalyzing(false);
      } else {
        setIsAnalyzing(false);
      }
    } catch (err) {
      setIsAnalyzing(false);
    }
  };

  const startLiveBarcodeCamera = async () => {
    await stopCamera();
    const elementId = 'step2-barcode-scanner';
    const container = document.getElementById(elementId);
    if (!container) return;

    try {
      const html5QrCode = new Html5Qrcode(elementId);
      html5QrCodeRef.current = html5QrCode;
      setIsCameraActive(true);

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
        async (decodedBarcode) => {
          await stopCamera();
          await fetchProductFromBarcode(decodedBarcode);
        },
        () => {}
      );
    } catch (err) {
      console.error('Kamera Start Fehler:', err);
    }
  };

  const handleProductNameChange = (newName: string) => {
    const autoCat = detectCategoryAndIcon(newName);
    setProductData((prev) => ({
      ...prev,
      name: newName,
      category: autoCat.category,
      categoryIcon: autoCat.categoryIcon,
    }));
  };

  const fetchProductFromBarcode = async (barcodeVal: string) => {
    setIsAnalyzing(true);
    setAnalysisStatusText('Produkt-Datenbank wird abgefragt...');
    setManualBarcode(barcodeVal);
    try {
      const data = await lookupBarcode(barcodeVal);
      const pName = data.name || 'Unbekanntes Produkt';
      const autoCat = detectCategoryAndIcon(pName);
      const finalCat = (data.category && data.category !== 'sonstiges') ? data.category : autoCat.category;
      const finalIcon = (data.categoryIcon && data.categoryIcon !== '📦') ? data.categoryIcon : autoCat.categoryIcon;

      setProductData({
        name: pName,
        brand: data.brand,
        category: finalCat,
        categoryIcon: finalIcon,
        imageUrl: data.imageUrl,
        source: data.source || 'Barcode',
        barcode: barcodeVal,
      });
      if (data.estimatedDaysUntilExpiry) {
        setMhdDate(new Date(Date.now() + data.estimatedDaysUntilExpiry * 86400000).toISOString().split('T')[0]);
      }
    } catch (err) {
      const fallbackName = `Produkt (${barcodeVal})`;
      const autoCat = detectCategoryAndIcon(fallbackName);
      setProductData({
        name: fallbackName,
        category: autoCat.category,
        categoryIcon: autoCat.categoryIcon,
        source: 'Barcodescan',
        barcode: barcodeVal,
      });
    } finally {
      setIsAnalyzing(false);
      setStep(3);
    }
  };

  const handlePhotoCapture = async (file: File) => {
    setIsAnalyzing(true);
    setAnalysisStatusText('Foto wird analysiert...');
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const res = await scanFridgePhoto(base64);
          if (res && res.detectedItems.length > 0) {
            const firstItem = res.detectedItems[0];
            const pName = firstItem.name || 'Unbekanntes Produkt';
            const autoCat = detectCategoryAndIcon(pName);
            const finalCat = (firstItem.category && firstItem.category !== 'sonstiges') ? firstItem.category : autoCat.category;
            const finalIcon = autoCat.categoryIcon;

            setProductData({
              name: pName,
              category: finalCat,
              categoryIcon: finalIcon,
              imageUrl: base64,
              source: 'Foto-Scan',
            });
            if (firstItem.estimatedDaysUntilExpiry) {
              setMhdDate(new Date(Date.now() + firstItem.estimatedDaysUntilExpiry * 86400000).toISOString().split('T')[0]);
            }
          } else {
            setProductData({ name: 'Unbekanntes Produkt', category: 'sonstiges', categoryIcon: '📦', imageUrl: base64, source: 'Foto-Scan' });
          }
        } catch (err) {
          setProductData({ name: 'Unbekanntes Produkt', category: 'sonstiges', categoryIcon: '📦', imageUrl: base64, source: 'Foto-Scan' });
        } finally {
          setIsAnalyzing(false);
          setStep(3);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setIsAnalyzing(false);
    }
  };

  const handleManualProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productData.name.trim()) return;
    const autoCat = detectCategoryAndIcon(productData.name);
    setProductData((prev) => ({
      ...prev,
      category: prev.category && prev.category !== 'sonstiges' ? prev.category : autoCat.category,
      categoryIcon: prev.categoryIcon && prev.categoryIcon !== '📦' ? prev.categoryIcon : autoCat.categoryIcon,
    }));
    setStep(3);
  };

  const cropCenterRegionOfImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        // Crop 85% width, 30% height in center of image
        const cropW = Math.round(img.width * 0.85);
        const cropH = Math.round(img.height * 0.30);
        const cropX = Math.round((img.width - cropW) / 2);
        const cropY = Math.round((img.height - cropH) / 2);

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const processMhdImageOcr = async (base64Image: string) => {
    setIsAnalyzing(true);
    setMhdOcrFeedback(null);
    setMhdAlternativeReadings([]);

    // PASS 1: Native ML Kit / Local OCR (<500ms)
    setAnalysisStatusText('⚡ Lokale Erkennung...');

    let localRes = null;
    try {
      localRes = await scanMhdLocally(base64Image);
    } catch (err) {
      console.warn('Local OCR error:', err);
    }

    if (localRes && localRes.detectedDateIso && localRes.confidence >= 70) {
      const parsed = parseFlexibleDateInput(localRes.detectedDateIso);
      const formatted = parsed.formattedText || localRes.extractedDateFormatted || localRes.detectedDateIso;

      setMhdDate(localRes.detectedDateIso);
      setMhdInputText(formatted);
      setMhdOcrFeedback(`✅ Erkannt in ${localRes.scanTimeMs || 120} ms (${formatted})`);

      const alts = (localRes.alternativeReadings || [])
        .map((a) => parseFlexibleDateInput(a).formattedText || a)
        .filter((a) => a && a !== formatted);

      setMhdAlternativeReadings(Array.from(new Set(alts)));
      setIsAnalyzing(false);

      setTimeout(() => {
        if (mhdInputRef.current) {
          mhdInputRef.current.focus();
          mhdInputRef.current.select();
        }
      }, 100);
      return;
    }

    // PASS 2: Gemini 3.6 Flash Fallback (Dot-Matrix & Tricky Laser Print)
    setAnalysisStatusText('🔄 KI-Analyse...');
    let aiRes = null;
    try {
      aiRes = await scanMhdOcr(base64Image);
    } catch (err) {
      console.warn('Gemini MHD scan fallback unavailable:', err);
    }

    let chosenDateIso: string | null = null;
    let chosenFormatted: string | null = null;
    let feedbackText = '';
    const alts: string[] = [];

    if (aiRes && aiRes.detectedDateIso && aiRes.confidence >= 50) {
      chosenDateIso = aiRes.detectedDateIso;
      const parsed = parseFlexibleDateInput(chosenDateIso);
      chosenFormatted = parsed.formattedText || chosenDateIso;
      feedbackText = `✨ KI-Datum erkannt: ${chosenFormatted}`;
      if (aiRes.alternativeReadings) {
        alts.push(...aiRes.alternativeReadings);
      }
    } else if (localRes && localRes.detectedDateIso) {
      chosenDateIso = localRes.detectedDateIso;
      const parsed = parseFlexibleDateInput(chosenDateIso);
      chosenFormatted = parsed.formattedText || localRes.extractedDateFormatted || chosenDateIso;
      feedbackText = `⚡ Datum lokal geschätzt: ${chosenFormatted}`;
      if (localRes.alternativeReadings) {
        alts.push(...localRes.alternativeReadings);
      }
    }

    if (chosenDateIso) {
      setMhdDate(chosenDateIso);
      setMhdInputText(chosenFormatted || chosenDateIso);
      setMhdOcrFeedback(feedbackText);

      const formattedAlts = alts
        .map((a) => parseFlexibleDateInput(a).formattedText || a)
        .filter((a) => a && a !== chosenFormatted);

      setMhdAlternativeReadings(Array.from(new Set(formattedAlts)));
    } else {
      setMhdOcrFeedback('Kein eindeutiges Datum im Ausschnitt gefunden. Bitte Datum manuell eingeben.');
      setMhdAlternativeReadings([]);
    }

    setIsAnalyzing(false);

    setTimeout(() => {
      if (mhdInputRef.current) {
        mhdInputRef.current.focus();
        mhdInputRef.current.select();
      }
    }, 100);
  };

  // LOCAL ON-DEVICE MHD SCAN WITH CROP MASK
  const handleMhdCameraScan = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setMhdCropImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File load error:', err);
    }
  };

  const getLocIcon = (l: string) => {
    if (l.toLowerCase().includes('gefrier')) return '🧊';
    if (l.toLowerCase().includes('schrank') || l.toLowerCase().includes('vorrat')) return '📦';
    if (l.toLowerCase().includes('gemüse')) return '🥦';
    return '❄️';
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6 text-[#f0f4ef]">
      
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-[#2e372e] pb-3 pt-2">
        <div className="flex items-center gap-3">
          {step > 1 && (
            <button
              onClick={() => {
                stopCamera();
                setStep((s) => (s - 1) as any);
              }}
              className="p-1.5 rounded-xl bg-[#161a16] text-[#8fa18d] hover:text-[#f0f4ef] cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <span className="text-[10px] font-extrabold text-[#9fe870] uppercase tracking-wider block">
              Schritt {step} von 4
            </span>
            <h3 className="font-bold text-lg">
              {step === 1 && '📍 Ort & Modus'}
              {step === 2 && '📸 Scannen'}
              {step === 3 && '🔎 Prüfen'}
              {step === 4 && '📅 MHD'}
            </h3>
          </div>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-2 rounded-xl text-[#8fa18d] hover:text-[#f0f4ef] hover:bg-[#161a16] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
        
        {/* STEP 1: Mode & Location */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-[#8fa18d] uppercase tracking-wider block">
                1. Wie möchtest du erfassen?
              </label>
              <div className="flex bg-[#161a16] p-1.5 rounded-2xl border border-[#2e372e]">
                <button
                  onClick={() => setCaptureTab('barcode')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    captureTab === 'barcode' ? 'bg-[#9fe870] text-[#122108]' : 'text-[#8fa18d]'
                  }`}
                >
                  <Barcode className="w-4 h-4" /> Barcode
                </button>
                <button
                  onClick={() => setCaptureTab('photo')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    captureTab === 'photo' ? 'bg-[#9fe870] text-[#122108]' : 'text-[#8fa18d]'
                  }`}
                >
                  <Camera className="w-4 h-4" /> Foto
                </button>
                <button
                  onClick={() => setCaptureTab('manual')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    captureTab === 'manual' ? 'bg-[#9fe870] text-[#122108]' : 'text-[#8fa18d]'
                  }`}
                >
                  <Edit3 className="w-4 h-4" /> Manuell
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-[#8fa18d] uppercase tracking-wider block">
                2. In welchen Ort einlagern?
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {(currentLocations && currentLocations.length > 0 ? currentLocations : ['Kühlschrank', 'Gefrierfach', 'Vorratsschrank']).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setStep(2);
                    }}
                    className="flex items-center justify-between p-4 rounded-2xl bg-[#171b17] border border-[#2e372e] hover:border-[#9fe870] hover:bg-[#1e251e] transition cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getLocIcon(loc)}</span>
                      <div>
                        <span className="text-sm font-bold text-[#f0f4ef] block group-hover:text-[#9fe870] transition">{loc}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8f9d8e] group-hover:text-[#9fe870] group-hover:translate-x-1 transition" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Scanner / Form */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-[#171b17] px-4 py-3 rounded-2xl border border-[#2e372e] text-xs">
              <span className="text-[#8f9d8e] flex items-center gap-1">
                <MapPin className="w-4 h-4 text-[#9fe870]" /> Zielort:
              </span>
              <span className="font-bold text-[#9fe870] text-sm">{selectedLocation}</span>
            </div>

            {captureTab === 'barcode' && (
              <div className="space-y-4">
                {/* NATIVE ML KIT BUTTON IF AVAILABLE / ON CAPACITOR DEVICE */}
                {hasNativeMlKit && (
                  <button
                    onClick={handleNativeMlKitScan}
                    disabled={isAnalyzing}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#9fe870] to-[#7bd844] text-[#122108] font-black text-sm hover:brightness-110 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#9fe870]/20 active:scale-95"
                  >
                    <Zap className="w-5 h-5 fill-current" /> Native ML Kit Barcode Blitz-Scan
                  </button>
                )}

                <div className="relative rounded-3xl overflow-hidden bg-black border border-[#2e372e] min-h-[250px] flex items-center justify-center">
                  <div id="step2-barcode-scanner" className="w-full h-full" />
                  {!isCameraActive && !isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-[#161a16] space-y-4">
                      <Barcode className="w-12 h-12 text-[#3e4d3c]" />
                      <p className="text-xs text-[#8f9d8e] text-center px-4">Scanne den EAN-Code auf der Rückseite der Verpackung.</p>
                      
                      <div className="flex flex-col gap-2 w-full max-w-xs">
                        <button onClick={handleNativeMlKitScan} className="py-3 px-6 rounded-2xl bg-[#9fe870] text-[#122108] font-black text-sm hover:bg-[#8ddb5a] transition cursor-pointer flex items-center justify-center gap-2 shadow-lg">
                          <Zap className="w-5 h-5 fill-current" /> ML Kit Scanner
                        </button>
                        <button onClick={startLiveBarcodeCamera} className="py-2.5 px-4 rounded-2xl bg-[#1e4e12] border border-[#a4ef72]/40 text-[#f0f4ef] font-bold text-xs hover:bg-[#256317] transition cursor-pointer flex items-center justify-center gap-2">
                          <Camera className="w-4 h-4 text-[#9fe870]" /> Web-Kamera Starten
                        </button>
                      </div>
                    </div>
                  )}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 space-y-3">
                      <Loader2 className="w-8 h-8 text-[#9fe870] animate-spin" />
                      <span className="text-sm font-bold text-[#f0f4ef]">{analysisStatusText}</span>
                    </div>
                  )}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (manualBarcode.trim()) fetchProductFromBarcode(manualBarcode); }} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Manuelle EAN..."
                    value={manualBarcode}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    className="flex-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-sm text-[#f0f4ef] focus:border-[#9fe870]"
                  />
                  <button type="submit" disabled={isAnalyzing} className="px-5 py-3 rounded-2xl bg-[#2a3229] text-[#f0f4ef] font-bold hover:bg-[#3e4d3c] transition disabled:opacity-50">Suchen</button>
                </form>
              </div>
            )}

            {captureTab === 'photo' && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-[#3e4d3c] rounded-3xl p-8 text-center space-y-4 hover:border-[#9fe870] transition bg-[#161a16]">
                  <Camera className="w-12 h-12 text-[#9fe870] mx-auto opacity-80" />
                  <div>
                    <h3 className="font-bold text-[#f0f4ef] text-base mb-1">Produkt fotografieren</h3>
                    <p className="text-xs text-[#8f9d8e]">Die KI erkennt Name und Kategorie.</p>
                  </div>
                  <label className="inline-flex py-3 px-6 rounded-2xl bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a] transition cursor-pointer shadow-lg items-center gap-2">
                    <Upload className="w-5 h-5" /> Foto aufnehmen
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoCapture(e.target.files[0]); }} />
                  </label>
                </div>
                {isAnalyzing && (
                  <div className="flex flex-col items-center justify-center space-y-2 py-4">
                    <Loader2 className="w-8 h-8 text-[#9fe870] animate-spin" />
                    <p className="text-sm font-bold text-[#f0f4ef]">{analysisStatusText}</p>
                  </div>
                )}
              </div>
            )}

            {captureTab === 'manual' && (
              <form onSubmit={handleManualProductSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#8fa18d]">Produktname</label>
                  <input
                    type="text"
                    placeholder="z.B. Bio-Milch 3,5%"
                    value={productData.name}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-sm text-[#f0f4ef] focus:border-[#9fe870]"
                    required
                  />
                </div>
                <button type="submit" className="w-full py-3.5 rounded-2xl bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a] transition flex items-center justify-center gap-2">
                  Weiter <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            )}
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-[#f0f4ef]">Daten prüfen</h3>
              <p className="text-sm text-[#8f9d8e]">Stimmen diese Angaben?</p>
            </div>

            <div className="bg-[#171b17] border border-[#2e372e] rounded-3xl p-5 space-y-5 shadow-lg">
              {settings.loadProductImages && productData.imageUrl ? (
                <div className="flex justify-center bg-white/5 rounded-2xl py-4">
                  <img src={productData.imageUrl} alt="Produkt" className="h-32 object-contain mix-blend-screen" />
                </div>
              ) : (
                <div className="flex justify-center bg-white/5 rounded-2xl py-4">
                  <span className="text-5xl">{productData.categoryIcon || '📦'}</span>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-[#8f9d8e] uppercase tracking-wider block">Produktname</label>
                <input
                  type="text"
                  value={productData.name}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  className="w-full bg-[#232a23] border border-[#3e4d3c] rounded-xl px-4 py-3 text-base text-[#f0f4ef] font-bold focus:border-[#9fe870] outline-none transition"
                />
              </div>

              {productData.barcode && (
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-[#8f9d8e] uppercase tracking-wider block">EAN</label>
                  <div className="w-full bg-[#232a23] border border-[#3e4d3c] rounded-xl px-4 py-2.5 text-sm text-[#f0f4ef] opacity-80 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-[#8f9d8e]" /> {productData.barcode}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-[#8f9d8e] uppercase tracking-wider block">Kategorie</label>
                  <select
                    value={productData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      const icons: Record<string, string> = {
                        milchprodukte: '🧀',
                        gemuese_obst: '🥦',
                        fleisch_fisch: '🥩',
                        saucen_dips: '🥫',
                        getraenke: '🧃',
                        vorrat_trocken: '🍞',
                        suessigkeiten: '🍬',
                        snacks_salzig: '🥨',
                        tiefkuehl: '🧊',
                        sonstiges: '📦'
                      };
                      setProductData({ ...productData, category: cat, categoryIcon: icons[cat] || '📦' });
                    }}
                    className="w-full bg-[#232a23] border border-[#3e4d3c] rounded-xl px-2 py-2.5 text-xs text-[#f0f4ef] focus:border-[#9fe870] outline-none"
                  >
                    <option value="milchprodukte">🧀 Milchprodukte</option>
                    <option value="gemuese_obst">🥦 Gemüse & Obst</option>
                    <option value="fleisch_fisch">🥩 Fleisch & Fisch</option>
                    <option value="saucen_dips">🥫 Saucen & Dips</option>
                    <option value="getraenke">🧃 Getränke</option>
                    <option value="vorrat_trocken">🍞 Trockenvorrat</option>
                    <option value="suessigkeiten">🍬 Süßigkeiten & Süßes</option>
                    <option value="snacks_salzig">🥨 Knabbereien & Salziges</option>
                    <option value="tiefkuehl">🧊 Tiefkühl</option>
                    <option value="sonstiges">📦 Sonstiges</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-[#8f9d8e] uppercase tracking-wider block">Ort</label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-[#232a23] border border-[#3e4d3c] rounded-xl px-2 py-2.5 text-xs text-[#f0f4ef] focus:border-[#9fe870] outline-none"
                  >
                    {currentLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(4)}
              className="w-full py-4 rounded-2xl bg-[#9fe870] text-[#122108] font-black text-sm flex items-center justify-center gap-2 hover:bg-[#8ddb5a] transition active:scale-95 cursor-pointer shadow-xl shadow-[#9fe870]/20"
            >
              <Check className="w-5 h-5" /> OK, weiter zum MHD
            </button>
          </div>
        )}

        {/* STEP 4: MHD */}
        {step === 4 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 pb-12">
            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-[#f0f4ef]">MHD / Einlagerungsdatum</h3>
              <p className="text-sm text-[#8f9d8e]">Gib das MHD an oder scanne es mit der Kamera.</p>
            </div>

            <div className="bg-[#171b17] border border-[#2e372e] rounded-3xl p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#8fa18d]">
                  Datum eingeben oder auswählen
                </label>
                <div className="flex items-center justify-between gap-3 w-full">
                  <input
                    ref={mhdInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={mhdInputText}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onChange={(e) => setMhdInputText(e.target.value)}
                    onBlur={handleMhdTextBlur}
                    placeholder="24.08.2026"
                    className="w-full min-w-0 flex-1 bg-[#232a23] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-lg font-bold text-[#f0f4ef] focus:outline-none focus:border-[#9fe870] shadow-inner text-center"
                  />
                  <div className="relative w-14 h-14 shrink-0 bg-[#232a23] border border-[#3e4d3c] rounded-2xl flex items-center justify-center text-[#8f9d8e] hover:border-[#9fe870] hover:text-[#9fe870] transition focus-within:border-[#9fe870]">
                    <Calendar className="w-6 h-6" />
                    <input
                      type="date"
                      value={mhdDate}
                      onChange={(e) => setMhdDate(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </div>
              </div>

              {mhdOcrFeedback && (
                <div className="p-3 rounded-xl bg-[#232a23] border border-[#3e4d3c] text-xs font-semibold text-[#9fe870]">
                  {mhdOcrFeedback}
                </div>
              )}

              {mhdAlternativeReadings && mhdAlternativeReadings.length > 0 && (
                <div className="p-3 rounded-xl bg-[#1e251e] border border-[#3e4d3c] space-y-2">
                  <span className="text-[11px] font-bold text-[#8f9d8e] block">
                    Alternative Datums-Lesarten wählen:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {mhdAlternativeReadings.map((alt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setMhdInputText(alt);
                          const parsed = parseFlexibleDateInput(alt);
                          if (parsed.isoDate) {
                            setMhdDate(parsed.isoDate);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#161a16] border border-[#3e4d3c] text-xs font-bold text-[#f0f4ef] hover:border-[#9fe870] hover:text-[#9fe870] transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <span>📅</span>
                        <span>{alt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Camera Scanner Window for MHD */}
              <div className="pt-2">
                {isMhdLiveCameraActive ? (
                  <div className="relative w-full h-64 rounded-3xl overflow-hidden bg-black border-2 border-[#a4ef72] shadow-2xl flex items-center justify-center">
                    <video
                      ref={mhdVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Viewfinder Window Overlay */}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none flex items-center justify-center">
                      <div className="w-[85%] h-[35%] rounded-2xl border-2 border-dashed border-[#9fe870] bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] flex items-center justify-center">
                        <span className="text-[11px] font-bold text-[#9fe870] bg-[#161a16]/90 px-3 py-1 rounded-full border border-[#9fe870]/40 shadow">
                          🎯 MHD hier ausrichten
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={stopMhdLiveCamera}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black transition cursor-pointer z-10"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    <div className="absolute bottom-3 left-3 right-3 flex gap-2 z-10">
                      <button
                        type="button"
                        onClick={captureFrameFromMhdLiveCamera}
                        disabled={isAnalyzing}
                        className="flex-1 py-3 px-4 rounded-2xl bg-[#9fe870] text-[#122108] font-black text-xs hover:bg-[#8ddb5a] transition flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Auslesen...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 fill-current" /> 🎯 MHD im Fenster erfassen
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={startMhdLiveCamera}
                      className="w-full py-4 rounded-2xl bg-[#1e4e12] border border-[#a4ef72]/40 text-[#f0f4ef] font-bold text-sm hover:bg-[#256317] transition cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-95"
                    >
                      <Camera className="w-5 h-5 text-[#9fe870]" /> 📷 Live-Kamera MHD-Fenster öffnen
                    </button>

                    <label className="flex w-full py-3 rounded-2xl bg-[#232a23] border border-[#3e4d3c] text-[#8f9d8e] font-bold text-xs hover:text-[#f0f4ef] transition cursor-pointer flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4 text-[#a4ef72]" /> Foto hochladen / Ausschnitt wählen
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={isAnalyzing}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleMhdCameraScan(e.target.files[0]);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-[#2e372e]"></div>
                <span className="text-xs font-bold text-[#8f9d8e] uppercase tracking-wider">ODER</span>
                <div className="h-px flex-1 bg-[#2e372e]"></div>
              </div>

              <div>
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setMhdDate(today);
                    onAddItem({
                      name: productData.name || 'Artikel',
                      mhd: today,
                      location: selectedLocation,
                      quantity: 1,
                      imageUrl: productData.imageUrl,
                      category: productData.category,
                      categoryIcon: productData.categoryIcon || '📦',
                      barcode: productData.barcode,
                      groupId: currentGroupId,
                      isEinlagerung: true,
                    });
                    onClose();
                  }}
                  className="w-full py-3.5 rounded-xl bg-[#232a23] border border-[#2e372e] text-sm font-bold text-[#f0f4ef] hover:border-[#9fe870] hover:bg-[#1e251e] transition flex items-center justify-center gap-2"
                >
                  🥦 Heute eingelagert (z.B. für frisches Gemüse)
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => {
                  handleMhdTextBlur();
                  const parsed = parseFlexibleDateInput(mhdInputText);
                  const finalDate = parsed.isoDate || mhdDate;
                  
                  onAddItem({
                    name: productData.name || 'Artikel',
                    mhd: finalDate,
                    location: selectedLocation,
                    quantity: 1,
                    imageUrl: productData.imageUrl,
                    category: productData.category,
                    categoryIcon: productData.categoryIcon || '📦',
                    barcode: productData.barcode,
                    groupId: currentGroupId,
                  });
                  onClose();
                }}
                className="w-full py-4 rounded-2xl bg-[#9fe870] text-[#122108] font-black text-sm hover:bg-[#8ddb5a] transition cursor-pointer shadow-xl shadow-[#9fe870]/20 flex items-center justify-center gap-2 active:scale-95"
              >
                <Check className="w-5 h-5" /> In {selectedLocation} legen
              </button>

              <button
                type="button"
                onClick={() => {
                  handleMhdTextBlur();
                  const parsed = parseFlexibleDateInput(mhdInputText);
                  const finalDate = parsed.isoDate || mhdDate;
                  
                  onAddItem({
                    name: productData.name || 'Artikel',
                    mhd: finalDate,
                    location: selectedLocation,
                    quantity: 1,
                    imageUrl: productData.imageUrl,
                    category: productData.category,
                    categoryIcon: productData.categoryIcon || '📦',
                    barcode: productData.barcode,
                    groupId: currentGroupId,
                  });

                  setMhdInputText('');
                  setMhdOcrFeedback('✅ Artikel gespeichert! Gib nun das kürzere MHD für das weitere Produkt ein.');
                }}
                className="w-full py-3.5 rounded-2xl bg-[#232a23] border border-[#3e4d3c] text-[#f0f4ef] font-bold text-xs hover:border-[#9fe870] transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Plus className="w-4 h-4 text-[#9fe870]" /> Gleiches Produkt mit anderem MHD (kürzer)
              </button>
            </div>
          </div>
        )}

        {/* MHD CROP OVERLAY MODAL */}
        {mhdCropImage && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between p-4 pb-24 sm:pb-8 overflow-y-auto animate-in fade-in">
            <div className="w-full max-w-md flex items-center justify-between pt-2">
              <h3 className="text-[#f0f4ef] font-bold text-base flex items-center gap-2">
                <Crop className="w-5 h-5 text-[#9fe870]" /> MHD-Erfassungsbereich
              </h3>
              <button
                onClick={() => setMhdCropImage(null)}
                className="p-2 rounded-full bg-[#232a23] text-[#8f9d8e] hover:text-[#f0f4ef] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Container with Dimmed Surroundings Overlay */}
            <div className="relative w-full max-w-md h-80 my-4 rounded-3xl overflow-hidden border-2 border-[#3e4d3c] bg-[#161a16] flex items-center justify-center shrink-0">
              <img
                src={mhdCropImage}
                alt="MHD Aufnahmescan"
                className="w-full h-full object-cover"
              />
              {/* Dimmed Overlay with Center Window Cutout */}
              <div className="absolute inset-0 bg-black/60 pointer-events-none flex items-center justify-center">
                <div className="w-[85%] h-[30%] rounded-2xl border-2 border-dashed border-[#9fe870] bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] flex items-center justify-center">
                  <span className="text-[11px] font-bold text-[#9fe870] bg-[#161a16]/95 px-3 py-1 rounded-full border border-[#9fe870]/40 shadow">
                    🎯 Erfassungsbereich
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full max-w-md space-y-3 pb-2">
              <p className="text-xs text-[#8f9d8e] text-center">
                Platziere das MHD im gestrichelten Rahmen für maximale Genauigkeit.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    setIsAnalyzing(true);
                    const cropped = await cropCenterRegionOfImage(mhdCropImage);
                    setMhdCropImage(null);
                    await processMhdImageOcr(cropped);
                  }}
                  disabled={isAnalyzing}
                  className="w-full py-4 px-4 rounded-2xl bg-[#9fe870] text-[#122108] font-black text-xs hover:bg-[#8ddb5a] transition flex items-center justify-center gap-2 shadow-xl cursor-pointer active:scale-95"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Analyse...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> 🎯 Ausschnitt scannen
                    </>
                  )}
                </button>

                <button
                  onClick={async () => {
                    setIsAnalyzing(true);
                    const fullImg = mhdCropImage;
                    setMhdCropImage(null);
                    await processMhdImageOcr(fullImg);
                  }}
                  disabled={isAnalyzing}
                  className="w-full py-4 px-4 rounded-2xl bg-[#1e251e] border border-[#3e4d3c] text-[#f0f4ef] font-bold text-xs hover:border-[#9fe870] transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-[#9fe870]" /> 🖼️ Ganzes Bild KI-Scannen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
