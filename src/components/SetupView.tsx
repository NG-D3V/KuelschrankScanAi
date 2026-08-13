import React, { useState, useEffect } from 'react';
import { AppSettings, InventoryItem } from '../types';
import { ArrowLeft, Download, Upload, RefreshCw, Check, AlertCircle, Cloud, User as UserIcon, LogOut, LogIn } from 'lucide-react';
import { auth, loginWithGoogle, logoutUser } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface SetupViewProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  onGoBack?: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  settings,
  setSettings,
  inventory,
  setInventory,
  onGoBack,
}) => {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const handleGoogleAuth = async () => {
    setAuthLoading(true);
    try {
      if (currentUser && !currentUser.isAnonymous) {
        await logoutUser();
      } else {
        await loginWithGoogle();
      }
    } catch (err: any) {
      if (
        err?.code !== 'auth/popup-closed-by-user' &&
        err?.code !== 'auth/cancelled-popup-request'
      ) {
        console.warn('Auth operation error:', err?.message || err);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const toggleSetting = (key: keyof AppSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key],
    }));
  };

  const handleNumberChange = (key: 'daysOrangeExpiry' | 'daysRedExpiry' | 'daysOrangeInFridge' | 'daysRedInFridge', valStr: string) => {
    const cleaned = valStr.replace(/\D/g, '');
    const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
    setSettings((prev) => ({
      ...prev,
      [key]: num,
    }));
  };

  // Robust CSV Cell Escaper
  const escapeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  // Quote-aware CSV Parser Function
  const parseCsvText = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    const firstLine = cleanText.split('\n')[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentField.trim());
          currentField = '';
        } else if (char === '\r') {
          // ignore CR
        } else if (char === '\n') {
          currentRow.push(currentField.trim());
          if (currentRow.some((f) => f.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  // CSV Export
  const handleExportCsv = () => {
    if (inventory.length === 0) {
      alert('Keine Artikel zum Exportieren vorhanden.');
      return;
    }

    const headers = [
      'ID',
      'Name',
      'MHD',
      'Ort',
      'Menge',
      'Kategorie',
      'KategorieIcon',
      'Barcode',
      'BildURL',
      'Geöffnet',
      'Einlagerung',
      'GruppenID',
    ];

    const rows = inventory.map((item) => [
      item.id,
      item.name,
      item.mhd,
      item.location,
      item.quantity,
      item.category || '',
      item.categoryIcon || '',
      item.barcode || '',
      item.imageUrl || '',
      item.isOpen ? '1' : '0',
      item.isEinlagerung ? '1' : '0',
      item.groupId || '',
    ]);

    const csvContent = [
      headers.map(escapeCsvCell).join(';'),
      ...rows.map((row) => row.map(escapeCsvCell).join(';')),
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kuehlschrank_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportMessage('CSV erfolgreich heruntergeladen!');
    setTimeout(() => setExportMessage(null), 3000);
  };

  // CSV Import
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsedRows = parseCsvText(text);

        if (parsedRows.length <= 1) {
          alert('CSV Datei enthält keine gültigen Artikeldaten.');
          return;
        }

        const headerRow = parsedRows[0].map((h) => h.toLowerCase().trim());
        const getIdx = (key: string, fallbackIdx: number) => {
          const idx = headerRow.findIndex((h) => h.includes(key));
          return idx >= 0 ? idx : fallbackIdx;
        };

        const idIdx = getIdx('id', 0);
        const nameIdx = getIdx('name', 1);
        const mhdIdx = getIdx('mhd', 2);
        const locIdx = getIdx('ort', 3);
        const qtyIdx = getIdx('menge', 4);
        const catIdx = getIdx('kategorie', 5);
        const catIconIdx = getIdx('kategorieicon', 6);
        const barcodeIdx = getIdx('barcode', 7);
        const imgIdx = getIdx('bildurl', 8);
        const openIdx = getIdx('geöffnet', 9);
        const einlagerungIdx = getIdx('einlagerung', 10);
        const groupIdx = getIdx('gruppenid', 11);

        const newItems: InventoryItem[] = [];
        for (let i = 1; i < parsedRows.length; i++) {
          const cols = parsedRows[i];
          if (cols.length >= 2 && cols[nameIdx]) {
            newItems.push({
              id: cols[idIdx] || `inv-imp-${Date.now()}-${i}`,
              name: cols[nameIdx] || 'Unbekannter Artikel',
              mhd: cols[mhdIdx] || new Date().toISOString().split('T')[0],
              location: cols[locIdx] || 'Kühlschrank',
              quantity: parseInt(cols[qtyIdx], 10) || 1,
              category: cols[catIdx] || undefined,
              categoryIcon: cols[catIconIdx] || undefined,
              barcode: cols[barcodeIdx] || undefined,
              imageUrl: cols[imgIdx] || '',
              isOpen: cols[openIdx] === '1' || cols[openIdx]?.toLowerCase() === 'true',
              isEinlagerung: cols[einlagerungIdx] === '1' || cols[einlagerungIdx]?.toLowerCase() === 'true',
              groupId: cols[groupIdx] || 'group-1',
            });
          }
        }

        if (newItems.length > 0) {
          setInventory((prev) => [...newItems, ...prev]);
          alert(`${newItems.length} Artikel erfolgreich importiert!`);
        } else {
          alert('Keine gültigen Daten in der CSV gefunden.');
        }
      } catch (err) {
        alert('Fehler beim Einlesen der CSV-Datei.');
      }
      // Reset input value so re-importing same file works
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="p-2 rounded-full bg-[#232a23] text-[#a4ef72] hover:bg-[#283028] transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-3xl font-extrabold text-[#f0f4ef] tracking-tight">Einstellungen</h1>
      </div>

      {/* Firebase Cloud Sync Card */}
      <div className="bg-[#232a23] rounded-3xl p-5 border border-[#2e372e] space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-[#a4ef72]" />
            <h2 className="text-[#a4ef72] text-sm font-bold tracking-wide">Firebase Cloud-Sync</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1e4e12] text-[#a4ef72] border border-[#a4ef72]/30">
            <span className="w-2 h-2 rounded-full bg-[#9fe870] animate-pulse"></span>
            Aktiv
          </span>
        </div>

        <div className="bg-[#181d18] rounded-2xl p-4 border border-[#2e372e] space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2a3429] flex items-center justify-center text-[#a4ef72] shrink-0 font-bold">
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#8f9d8e]">Status / Konto</p>
              <p className="text-sm font-bold text-[#f0f4ef] truncate">
                {currentUser && !currentUser.isAnonymous
                  ? currentUser.email || currentUser.displayName || 'Google Konto'
                  : 'Anonyme Cloud-Session (Aktiv)'}
              </p>
            </div>
          </div>

          <button
            onClick={handleGoogleAuth}
            disabled={authLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-[#283228] border border-[#3e4d3c] text-[#f0f4ef] font-bold text-xs hover:bg-[#323d32] transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {currentUser && !currentUser.isAnonymous ? (
              <>
                <LogOut className="w-4 h-4 text-red-400" /> Abmelden
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-[#a4ef72]" /> Mit Google anmelden
              </>
            )}
          </button>
        </div>
      </div>

      {/* Settings Options List */}
      <div className="bg-[#232a23] rounded-3xl p-5 border border-[#2e372e] space-y-5 shadow-lg">
        {/* Toggle 1: Produktbilder laden */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2e372e]">
          <span className="text-sm font-semibold text-[#f0f4ef]">Produktbilder laden</span>
          <button
            onClick={() => toggleSetting('loadProductImages')}
            className={`w-14 h-8 rounded-full transition relative p-1 cursor-pointer ${
              settings.loadProductImages ? 'bg-[#9fe870]' : 'bg-[#3a443a]'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-[#161a16] transition transform ${
                settings.loadProductImages ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle 2: Bilder offline speichern */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2e372e]">
          <span className="text-sm font-semibold text-[#f0f4ef]">Bilder offline speichern</span>
          <button
            onClick={() => toggleSetting('saveImagesOffline')}
            className={`w-14 h-8 rounded-full transition relative p-1 cursor-pointer ${
              settings.saveImagesOffline ? 'bg-[#9fe870]' : 'bg-[#3a443a]'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-[#161a16] transition transform ${
                settings.saveImagesOffline ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Number 1: Tage bis Ablauf (Orange) */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2e372e]">
          <div>
            <span className="text-sm font-semibold text-[#f0f4ef] block flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              Tage bis Ablauf (Orange)
            </span>
            <span className="text-xs text-[#8f9d8e]">
              MHD wird orange, wenn weniger als diese Anzahl Tage übrig sind
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={settings.daysOrangeExpiry}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysOrangeExpiry', e.target.value)}
            className="w-16 h-12 bg-[#171b17] border border-[#3e4d3c] rounded-xl text-center text-sm font-bold text-[#f0f4ef] focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 shrink-0"
          />
        </div>

        {/* Number 2: Tage bis Ablauf (Rot) */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2e372e]">
          <div>
            <span className="text-sm font-semibold text-[#f0f4ef] block flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              Tage bis Ablauf (Rot)
            </span>
            <span className="text-xs text-[#8f9d8e]">
              MHD wird rot, wenn weniger als diese Anzahl Tage übrig sind
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={settings.daysRedExpiry ?? 3}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysRedExpiry', e.target.value)}
            className="w-16 h-12 bg-[#171b17] border border-[#3e4d3c] rounded-xl text-center text-sm font-bold text-[#f0f4ef] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 shrink-0"
          />
        </div>

        {/* Number 3: Tage im Kühlschrank (Orange) */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#2e372e]">
          <div>
            <span className="text-sm font-semibold text-[#f0f4ef] block flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              Tage im Kühlschrank (Orange)
            </span>
            <span className="text-xs text-[#8f9d8e]">
              Eingelagerte Artikel werden orange nach dieser Anzahl Tagen
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={settings.daysOrangeInFridge ?? 5}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysOrangeInFridge', e.target.value)}
            className="w-16 h-12 bg-[#171b17] border border-[#3e4d3c] rounded-xl text-center text-sm font-bold text-[#f0f4ef] focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 shrink-0"
          />
        </div>

        {/* Number 4: Tage im Kühlschrank (Rot) */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-semibold text-[#f0f4ef] block flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              Tage im Kühlschrank (Rot)
            </span>
            <span className="text-xs text-[#8f9d8e]">
              Eingelagerte Artikel werden rot nach dieser Anzahl Tagen
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={settings.daysRedInFridge ?? 10}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysRedInFridge', e.target.value)}
            className="w-16 h-12 bg-[#171b17] border border-[#3e4d3c] rounded-xl text-center text-sm font-bold text-[#f0f4ef] focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 shrink-0"
          />
        </div>
      </div>

      {/* CSV Export & Import Buttons */}
      <div className="space-y-3 pt-2">
        <button
          onClick={handleExportCsv}
          className="w-full py-4 rounded-full bg-[#9fe870] text-[#122108] font-black text-sm hover:bg-[#8ddb5a] transition cursor-pointer shadow-lg flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" /> Daten exportieren (CSV)
        </button>

        <label className="w-full py-4 rounded-full bg-[#232a23] border border-[#3e4d3c] text-[#f0f4ef] font-bold text-sm hover:bg-[#283028] transition cursor-pointer flex items-center justify-center gap-2">
          <Upload className="w-4 h-4 text-[#a4ef72]" /> Daten importieren (CSV)
          <input type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
        </label>
      </div>

      {exportMessage && (
        <div className="p-3 rounded-2xl bg-[#1e4e12] border border-[#a4ef72]/30 text-[#a4ef72] text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{exportMessage}</span>
        </div>
      )}
    </div>
  );
};
