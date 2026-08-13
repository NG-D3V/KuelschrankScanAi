import React, { useState } from 'react';
import { AppSettings, InventoryItem } from '../types';
import { ArrowLeft, Download, Upload, RefreshCw, Check, AlertCircle } from 'lucide-react';

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

  const toggleSetting = (key: keyof AppSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key],
    }));
  };

  const handleNumberChange = (key: 'daysOrangeExpiry' | 'daysRedExpiry' | 'daysOrangeInFridge' | 'daysRedInFridge', value: number | '') => {
    setSettings((prev) => ({
      ...prev,
      [key]: (typeof value === 'number' && value >= 0) ? value : 0,
    }));
  };

  // CSV Export
  const handleExportCsv = () => {
    if (inventory.length === 0) {
      alert('Keine Artikel zum Exportieren vorhanden.');
      return;
    }

    const headers = ['ID', 'Name', 'MHD', 'Ort', 'Menge', 'BildURL', 'GruppenID'];
    const rows = inventory.map((item) => [
      item.id,
      `"${item.name.replace(/"/g, '""')}"`,
      item.mhd,
      `"${item.location}"`,
      item.quantity,
      `"${item.imageUrl || ''}"`,
      item.groupId,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kuehlschrank_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

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
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          alert('CSV Datei enthält keine Daten.');
          return;
        }

        const newItems: InventoryItem[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          if (cols.length >= 4) {
            newItems.push({
              id: cols[0] || `inv-imp-${Date.now()}-${i}`,
              name: cols[1] || 'Unbekannter Artikel',
              mhd: cols[2] || new Date().toISOString().split('T')[0],
              location: cols[3] || 'Kühlschrank',
              quantity: parseInt(cols[4], 10) || 1,
              imageUrl: cols[5] || '',
              groupId: cols[6] || 'group-1',
            });
          }
        }

        if (newItems.length > 0) {
          setInventory((prev) => [...newItems, ...prev]);
          alert(`${newItems.length} Artikel erfolgreich importiert!`);
        }
      } catch (err) {
        alert('Fehler beim Einlesen der CSV-Datei.');
      }
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
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="1"
            max="60"
            value={settings.daysOrangeExpiry}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysOrangeExpiry', e.target.value === '' ? '' : (isNaN(parseInt(e.target.value, 10)) ? '' : parseInt(e.target.value, 10)))}
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
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="0"
            max="30"
            value={settings.daysRedExpiry ?? 3}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysRedExpiry', e.target.value === '' ? '' : (isNaN(parseInt(e.target.value, 10)) ? '' : parseInt(e.target.value, 10)))}
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
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="1"
            max="60"
            value={settings.daysOrangeInFridge ?? 5}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysOrangeInFridge', e.target.value === '' ? '' : (isNaN(parseInt(e.target.value, 10)) ? '' : parseInt(e.target.value, 10)))}
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
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min="1"
            max="90"
            value={settings.daysRedInFridge ?? 10}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onChange={(e) => handleNumberChange('daysRedInFridge', e.target.value === '' ? '' : (isNaN(parseInt(e.target.value, 10)) ? '' : parseInt(e.target.value, 10)))}
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
