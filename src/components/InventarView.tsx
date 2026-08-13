import React, { useState, useMemo } from 'react';
import { InventoryItem, Group, AppSettings } from '../types';
import { Search, AlertTriangle, MapPin, Plus, Minus, Trash2, X, ArrowUpDown, Barcode } from 'lucide-react';

interface InventarViewProps {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  currentGroup: Group;
  settings: AppSettings;
  onOpenScanner: () => void;
}

export const InventarView: React.FC<InventarViewProps> = ({
  inventory,
  setInventory,
  currentGroup,
  settings,
  onOpenScanner,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  type SortType = 'name-asc' | 'name-desc' | 'mhd-asc' | 'mhd-desc';
  const [sortType, setSortType] = useState<SortType>('mhd-asc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('Alle');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Filter items for current group
  const groupItems = useMemo(() => {
    return inventory.filter((item) => item.groupId === currentGroup.id || !item.groupId);
  }, [inventory, currentGroup.id]);

  // Search, Location & Category Filters
  const filteredItems = useMemo(() => {
    return groupItems
      .filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLocation = selectedLocation === 'Alle' || item.location === selectedLocation;
        const matchesCategory =
          !selectedCategory ||
          item.category === selectedCategory ||
          item.categoryIcon === selectedCategory;
        return matchesSearch && matchesLocation && matchesCategory;
      })
      .sort((a, b) => {
        if (sortType === 'name-asc') return a.name.localeCompare(b.name);
        if (sortType === 'name-desc') return b.name.localeCompare(a.name);

        const timeA = new Date(a.mhd).getTime();
        const timeB = new Date(b.mhd).getTime();
        if (sortType === 'mhd-asc') return timeA - timeB;
        if (sortType === 'mhd-desc') return timeB - timeA;
        return 0;
      });
  }, [groupItems, searchQuery, selectedLocation, selectedCategory, sortType]);

  // Calculate Expiry Warning Items
  const today = useMemo(() => new Date(), []);
  const orangeDays = typeof settings.daysOrangeExpiry === 'number' ? settings.daysOrangeExpiry : 7;
  const redDays = typeof settings.daysRedExpiry === 'number' ? settings.daysRedExpiry : 3;

  const warningItems = useMemo(() => {
    const todayMs = today.getTime();
    return groupItems.filter((item) => {
      if (item.isEinlagerung) return false;
      const mhdDate = new Date(item.mhd);
      const diffDays = Math.ceil((mhdDate.getTime() - todayMs) / (1000 * 3600 * 24));
      return diffDays <= orangeDays;
    });
  }, [groupItems, today, orangeDays]);

  const getMhdColorClass = (item: InventoryItem) => {
    if (item.isEinlagerung) {
      const eDate = new Date(item.mhd);
      const diffDaysInFridge = Math.floor((today.getTime() - eDate.getTime()) / (1000 * 3600 * 24));
      const orangeLimit = typeof settings.daysOrangeInFridge === 'number' ? settings.daysOrangeInFridge : 5;
      const redLimit = typeof settings.daysRedInFridge === 'number' ? settings.daysRedInFridge : 10;

      if (diffDaysInFridge >= redLimit) {
        return 'text-rose-400 font-bold';
      } else if (diffDaysInFridge >= orangeLimit) {
        return 'text-amber-400 font-bold';
      }
      return 'text-[#8f9d8e]';
    }

    const mhdDate = new Date(item.mhd);
    const diffDays = Math.ceil((mhdDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

    if (diffDays <= redDays) {
      return 'text-rose-400 font-bold';
    } else if (diffDays <= orangeDays) {
      return 'text-amber-400 font-bold';
    }
    return 'text-[#8f9d8e]';
  };

  const getMhdDisplayText = (item: InventoryItem) => {
    if (item.isEinlagerung) {
      const eDate = new Date(item.mhd);
      const diff = Math.floor((today.getTime() - eDate.getTime()) / (1000 * 3600 * 24));
      return `TiK: ${Math.max(0, diff)} Tage`;
    }
    return `MHD: ${item.mhd}`;
  };

  // Quantity updates
  const handleQuantityChange = (id: string, delta: number) => {
    setInventory((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as InventoryItem[]
    );
  };

  const handleSaveEditItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setInventory((prev) =>
      prev.map((it) => (it.id === editingItem.id ? editingItem : it))
    );
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string) => {
    setInventory((prev) => prev.filter((it) => it.id !== id));
    setEditingItem(null);
  };

  const categoryFilters = [
    { key: 'milchprodukte', label: 'Milch', icon: '🧀' },
    { key: 'gemuese_obst', label: 'Obst & Gemüse', icon: '🥦' },
    { key: 'fleisch_fisch', label: 'Fleisch/Fisch', icon: '🥩' },
    { key: 'saucen_dips', label: 'Saucen', icon: '🥫' },
    { key: 'getraenke', label: 'Getränke', icon: '🧃' },
    { key: 'vorrat_trocken', label: 'Trockenvorrat', icon: '🍞' },
    { key: 'suessigkeiten', label: 'Süßes', icon: '🍬' },
    { key: 'snacks_salzig', label: 'Salziges', icon: '🥨' },
    { key: 'tiefkuehl', label: 'Tiefkühl', icon: '🧊' },
    { key: 'sonstiges', label: 'Sonstiges', icon: '📦' },
  ];

  return (
    <div className="space-y-4 pb-28 max-w-lg mx-auto relative">
      {/* Top Bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2 text-[#f0f4ef] font-black text-xl tracking-tight">
          <span className="text-xl">📱</span>
          <h2>{currentGroup.name}</h2>
        </div>

        {/* Warning & Sort Icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWarningModal(true)}
            className="relative p-2 rounded-2xl bg-[#232a23] text-amber-400 border border-[#3e4d3c] hover:bg-[#283028] transition cursor-pointer"
            title="Ablaufende Produkte"
          >
            <AlertTriangle className="w-5 h-5 fill-amber-400/20 text-amber-400" />
            {warningItems.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-[#122108] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {warningItems.length}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="p-2 rounded-2xl bg-[#232a23] border border-[#3e4d3c] hover:border-[#9fe870]/50 transition cursor-pointer text-[#8f9d8e] hover:text-[#9fe870]"
              title="Sortieren"
            >
              <ArrowUpDown className="w-5 h-5" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#171b17] border border-[#2e372e] rounded-xl shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => {
                    setSortType('name-asc');
                    setShowSortMenu(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-xs font-bold ${
                    sortType === 'name-asc' ? 'text-[#9fe870] bg-[#232a23]' : 'text-[#f0f4ef] hover:bg-[#232a23]'
                  }`}
                >
                  Name (A-Z)
                </button>
                <button
                  onClick={() => {
                    setSortType('name-desc');
                    setShowSortMenu(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-xs font-bold border-t border-[#2e372e] ${
                    sortType === 'name-desc' ? 'text-[#9fe870] bg-[#232a23]' : 'text-[#f0f4ef] hover:bg-[#232a23]'
                  }`}
                >
                  Name (Z-A)
                </button>
                <button
                  onClick={() => {
                    setSortType('mhd-asc');
                    setShowSortMenu(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-xs font-bold border-t border-[#2e372e] ${
                    sortType === 'mhd-asc' ? 'text-[#9fe870] bg-[#232a23]' : 'text-[#f0f4ef] hover:bg-[#232a23]'
                  }`}
                >
                  MHD (Aufsteigend)
                </button>
                <button
                  onClick={() => {
                    setSortType('mhd-desc');
                    setShowSortMenu(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-xs font-bold border-t border-[#2e372e] ${
                    sortType === 'mhd-desc' ? 'text-[#9fe870] bg-[#232a23]' : 'text-[#f0f4ef] hover:bg-[#232a23]'
                  }`}
                >
                  MHD (Absteigend)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#8f9d8e]" />
        <input
          type="text"
          placeholder="Im Inventar suchen..."
          value={searchQuery}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#232a23] border border-[#2e372e] rounded-2xl pl-11 pr-4 py-3 text-sm text-[#f0f4ef] placeholder-[#8f9d8e] focus:outline-none focus:border-[#9fe870]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8f9d8e] hover:text-[#f0f4ef]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Location Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setSelectedLocation('Alle')}
          className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
            selectedLocation === 'Alle'
              ? 'bg-[#1e4e12] text-[#f0f4ef] border border-[#a4ef72]/40 shadow'
              : 'bg-[#232a23] text-[#c2cebf] border border-[#2e372e] hover:bg-[#283028]'
          }`}
        >
          Alle Orte
        </button>

        {currentGroup.locations.map((loc) => {
          const isSelected = selectedLocation === loc;
          return (
            <button
              key={loc}
              onClick={() => setSelectedLocation(loc)}
              className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                isSelected
                  ? 'bg-[#1e4e12] text-[#f0f4ef] border border-[#a4ef72]/40 shadow'
                  : 'bg-[#232a23] text-[#c2cebf] border border-[#2e372e] hover:bg-[#283028]'
              }`}
            >
              {loc}
            </button>
          );
        })}
      </div>

      {/* Category Pills Bar (Clear Emojis + Labels, fully visible & scrollable) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1 cursor-pointer shrink-0 ${
            !selectedCategory
              ? 'bg-[#1e4e12] text-[#9fe870] border border-[#9fe870] shadow-sm'
              : 'bg-[#232a23] text-[#c2cebf] border border-[#2e372e] hover:bg-[#283028]'
          }`}
        >
          <span>🏷️</span>
          <span>Alle Kat.</span>
        </button>

        {categoryFilters.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(isSelected ? null : cat.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-[#1e4e12] text-[#9fe870] border border-[#9fe870] shadow-sm'
                  : 'bg-[#232a23] text-[#c2cebf] border border-[#2e372e] hover:bg-[#283028]'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Product List */}
      <div className="space-y-3 pt-1">
        {filteredItems.length === 0 ? (
          <div className="bg-[#232a23] rounded-3xl p-8 text-center text-[#8f9d8e] space-y-2 border border-[#2e372e]">
            <p className="text-sm font-semibold">Keine Artikel gefunden.</p>
            <p className="text-xs">Tippe auf den Kamera-Button 📸, um Lebensmittel hinzuzufügen.</p>
          </div>
        ) : (
          filteredItems.map((item, index) => (
            <div
              key={item.id || `fallback-${index}`}
              onClick={() => setEditingItem(item)}
              className="bg-[#232a23] rounded-3xl p-3.5 border border-[#2e372e] flex items-center justify-between gap-3 hover:border-[#3e4d3c] transition cursor-pointer shadow-md"
            >
              {/* Image & Main Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-[#171b17] overflow-hidden shrink-0 border border-[#2e372e] flex items-center justify-center">
                  {settings.loadProductImages && item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl">{item.categoryIcon || '📦'}</span>
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#f0f4ef] leading-tight truncate">
                      {item.name}
                    </h3>
                    {item.isOpen && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0">
                        🔓 Offen
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={getMhdColorClass(item)}>{getMhdDisplayText(item)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-[#8f9d8e]">
                    <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                    <span className="truncate">{item.location}</span>
                  </div>
                </div>
              </div>

              {/* Quantity Counter */}
              <div
                className="flex items-center gap-2 bg-[#171b17] px-2.5 py-1.5 rounded-2xl border border-[#2e372e] shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handleQuantityChange(item.id, 1)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold text-[#f0f4ef] hover:bg-[#283028] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-extrabold text-[#f0f4ef] px-1">
                  {item.quantity}
                </span>
                <button
                  onClick={() => handleQuantityChange(item.id, -1)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold text-[#f0f4ef] hover:bg-[#283028] cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button (FAB) - Camera Scanner */}
      <button
        onClick={onOpenScanner}
        className="fixed bottom-[84px] right-5 z-40 w-14 h-14 rounded-2xl bg-[#9fe870] text-[#122108] shadow-2xl flex items-center justify-center hover:bg-[#8ddb5a] transition active:scale-95 cursor-pointer border-2 border-[#161a16]"
        title="Kamera-Scanner"
      >
        <span className="text-2xl">📸</span>
      </button>

      {/* Expiry Warning Summary Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-md w-full space-y-4 relative">
            <button
              onClick={() => setShowWarningModal(false)}
              className="absolute top-4 right-4 text-[#8f9d8e] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Ablaufende Artikel ({warningItems.length})
            </h3>

            {warningItems.length === 0 ? (
              <p className="text-xs text-[#8f9d8e]">
                Keine Artikel laufen in den nächsten {orangeDays} Tagen ab! 🎉
              </p>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto no-scrollbar">
                {warningItems.map((item, index) => (
                  <div
                    key={item.id || `warning-${index}`}
                    className="p-3 bg-[#171b17] rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#f0f4ef] block">{item.name}</span>
                      <span className="text-[#8f9d8e]">{item.location}</span>
                    </div>
                    <span className={getMhdColorClass(item)}>{getMhdDisplayText(item)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-md w-full space-y-4 relative">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-[#8f9d8e] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef]">Artikel bearbeiten</h3>

            <form onSubmit={handleSaveEditItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#8f9d8e] mb-1 block">Name</label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef]"
                />
              </div>

              {/* Toggle Open Status Button */}
              <button
                type="button"
                onClick={() => setEditingItem({ ...editingItem, isOpen: !editingItem.isOpen })}
                className={`w-full py-2.5 px-4 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  editingItem.isOpen
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-[#161a16] text-[#8f9d8e] border-[#3e4d3c] hover:text-[#f0f4ef]'
                }`}
              >
                {editingItem.isOpen ? '🔓 Produkt ist als GEÖFFNET markiert' : '🔒 Als geöffnet markieren'}
              </button>

              {/* Small EAN Display */}
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-[#8f9d8e]" />
                <span className="text-xs text-[#8f9d8e]">
                  EAN: <strong className="text-[#f0f4ef]">{editingItem.barcode || 'Keine EAN'}</strong>
                </span>
              </div>

              {/* Category & Location Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#8f9d8e] mb-1 block">Kategorie</label>
                  <select
                    value={editingItem.category || 'sonstiges'}
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
                        sonstiges: '📦',
                      };
                      setEditingItem({
                        ...editingItem,
                        category: cat,
                        categoryIcon: icons[cat] || '📦',
                      });
                    }}
                    className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-3 py-2 text-xs text-[#f0f4ef]"
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

                <div>
                  <label className="text-xs font-bold text-[#8f9d8e] mb-1 block">Ort</label>
                  <select
                    value={editingItem.location}
                    onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })}
                    className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-3 py-2 text-xs text-[#f0f4ef]"
                  >
                    {currentGroup.locations.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#8f9d8e] mb-1 block">MHD</label>
                <input
                  type="date"
                  required
                  value={editingItem.mhd}
                  onChange={(e) => setEditingItem({ ...editingItem, mhd: e.target.value })}
                  className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-3 py-2 text-xs text-[#f0f4ef]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => handleDeleteItem(editingItem.id)}
                  className="py-2.5 px-4 rounded-2xl bg-rose-500/20 text-rose-400 font-bold text-xs hover:bg-rose-500/30 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Löschen
                </button>

                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-2xl bg-[#9fe870] text-[#122108] font-bold text-xs hover:bg-[#8ddb5a] transition cursor-pointer"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
