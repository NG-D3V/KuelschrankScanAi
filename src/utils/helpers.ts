import { CategoryType, StorageLocation } from '../types';

export const CATEGORY_CONFIG: Record<
  CategoryType,
  { label: string; icon: string; colorClass: string; bgClass: string }
> = {
  milchprodukte: {
    label: 'Milchprodukte',
    icon: '🧀',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10 border-amber-500/20',
  },
  gemuese_obst: {
    label: 'Gemüse & Obst',
    icon: '🥦',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10 border-emerald-500/20',
  },
  fleisch_fisch: {
    label: 'Fleisch & Fisch',
    icon: '🥩',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10 border-rose-500/20',
  },
  saucen_dips: {
    label: 'Saucen & Dips',
    icon: '🥫',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10 border-orange-500/20',
  },
  getraenke: {
    label: 'Getränke',
    icon: '🧃',
    colorClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10 border-sky-500/20',
  },
  vorrat_trocken: {
    label: 'Vorrat & Trockenes',
    icon: '🌾',
    colorClass: 'text-yellow-400',
    bgClass: 'bg-yellow-500/10 border-yellow-500/20',
  },
  tiefkuehl: {
    label: 'Tiefkühlware',
    icon: '❄️',
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10 border-cyan-500/20',
  },
  sonstiges: {
    label: 'Sonstiges',
    icon: '📦',
    colorClass: 'text-slate-400',
    bgClass: 'bg-slate-500/10 border-slate-500/20',
  },
};

export const LOCATION_CONFIG: Record<StorageLocation, { label: string; icon: string }> = {
  kuehlschrank: { label: 'Kühlschrank', icon: '🧊' },
  gefrierfach: { label: 'Tiefkühlfach', icon: '❄️' },
  vorratsschrank: { label: 'Vorratsschrank', icon: '🧺' },
};

export function getDaysUntilExpiry(expiryDateStr: string): number {
  if (!expiryDateStr) return 99;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);
  const diffTime = exp.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(days: number): {
  status: 'expired' | 'urgent' | 'warning' | 'fresh';
  label: string;
  badgeClass: string;
} {
  if (days < 0) {
    return {
      status: 'expired',
      label: `Abgelaufen (${Math.abs(days)} Tag${Math.abs(days) > 1 ? 'e' : ''})`,
      badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
  }
  if (days === 0) {
    return {
      status: 'urgent',
      label: 'MHD HEUTE!',
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse',
    };
  }
  if (days <= 2) {
    return {
      status: 'warning',
      label: `Ablauf in ${days} Tag${days > 1 ? 'en' : ''}`,
      badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
  }
  return {
    status: 'fresh',
    label: `Ablauf in ${days} Tagen`,
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
}

// LocalStorage Persistence Helpers
export function detectCategoryAndIcon(name: string): { category: CategoryType; categoryIcon: string } {
  if (!name) return { category: 'sonstiges', categoryIcon: '📦' };
  const lower = name.toLowerCase();

  if (/milch|käse|kaese|butter|joghurt|yogurt|sahne|quark|creme|fraiche|mozarella|mozzarella|gouda|emmentaler|parmesan|skyr|kefir|mascarpone|frischkäse/.test(lower)) {
    return { category: 'milchprodukte', categoryIcon: '🧀' };
  }
  if (/apfel|birne|banane|orange|tomate|gurke|salat|kartoffel|karotte|möhre|moehre|brokkoli|gemüse|gemuese|obst|beere|erdbeere|himbeere|zitrone|zwiebel|knoblauch|paprika|avocado|pilze|champignon|traube|spinat|zucchini|kürbis|kuerbis|weintraube/.test(lower)) {
    return { category: 'gemuese_obst', categoryIcon: '🥦' };
  }
  if (/fleisch|fisch|hähnchen|haehnchen|huhn|rind|schwein|wurst|schinken|lachs|thunfisch|bacon|hackfleisch|salami|bratwurst|schnitzel|steak|garnele|meeresfrüchte|pute|poularde/.test(lower)) {
    return { category: 'fleisch_fisch', categoryIcon: '🥩' };
  }
  if (/soße|sosse|sauce|ketchup|senf|mayonnaise|mayo|dip|pesto|dressing|salsa|remoulade|hummus|humous|aioli/.test(lower)) {
    return { category: 'saucen_dips', categoryIcon: '🥫' };
  }
  if (/saft|wasser|cola|fanta|sprite|bier|wein|limo|limonade|tee|kaffee|energy|eistee|drink|spezi|radler/.test(lower)) {
    return { category: 'getraenke', categoryIcon: '🧃' };
  }
  if (/brot|brötchen|broetchen|mehl|zucker|nudeln|pasta|reis|haferflocken|müsli|muesli|kekse|keks|schokolade|nüsse|nuesse|chips|toast|croissant|zwieback|spaghetti|maccaroni/.test(lower)) {
    return { category: 'vorrat_trocken', categoryIcon: '🍞' };
  }
  if (/tiefkühl|tiefkuehl|tk|eis|speiseeis|pizza|pommes|frozen|gefroren/.test(lower)) {
    return { category: 'tiefkuehl', categoryIcon: '🧊' };
  }

  return { category: 'sonstiges', categoryIcon: '📦' };
}

export function parseFlexibleDateInput(inputStr: string): { isoDate: string | null; formattedText: string | null } {
  if (!inputStr || !inputStr.trim()) {
    return { isoDate: null, formattedText: null };
  }

  const str = inputStr.trim();

  // If already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return { isoDate: str, formattedText: `${d}.${m}.${y}` };
  }

  const clean = str.replace(/[^\d./\-\s]/g, '').trim();
  const parts = clean.split(/[./\-\s]+/).filter(Boolean);
  const currentYear = new Date().getFullYear();

  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let yearNum = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(yearNum)) {
      return { isoDate: null, formattedText: null };
    }

    if (yearNum < 100) {
      yearNum = 2000 + yearNum;
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && yearNum >= 2020 && yearNum <= 2050) {
      const dStr = String(day).padStart(2, '0');
      const mStr = String(month).padStart(2, '0');
      const yStr = String(yearNum);
      return {
        isoDate: `${yStr}-${mStr}-${dStr}`,
        formattedText: `${dStr}.${mStr}.${yStr}`,
      };
    }
  } else if (parts.length === 2) {
    let num1 = parseInt(parts[0], 10);
    let num2 = parseInt(parts[1], 10);

    if (!isNaN(num1) && !isNaN(num2)) {
      if (num2 < 100) num2 = 2000 + num2;

      if (num1 >= 1 && num1 <= 12 && num2 >= 2020 && num2 <= 2050) {
        const lastDay = new Date(num2, num1, 0).getDate();
        const dStr = String(lastDay).padStart(2, '0');
        const mStr = String(num1).padStart(2, '0');
        const yStr = String(num2);
        return {
          isoDate: `${yStr}-${mStr}-${dStr}`,
          formattedText: `${dStr}.${mStr}.${yStr}`,
        };
      }
      if (num1 >= 1 && num1 <= 31 && num2 >= 1 && num2 <= 12) {
        const dStr = String(num1).padStart(2, '0');
        const mStr = String(num2).padStart(2, '0');
        const yStr = String(currentYear);
        return {
          isoDate: `${yStr}-${mStr}-${dStr}`,
          formattedText: `${dStr}.${mStr}.${yStr}`,
        };
      }
    }
  } else if (parts.length === 1 && /^\d{6}$/.test(parts[0])) {
    const d = parseInt(parts[0].substring(0, 2), 10);
    const m = parseInt(parts[0].substring(2, 4), 10);
    let y = parseInt(parts[0].substring(4, 6), 10) + 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');
      const yStr = String(y);
      return {
        isoDate: `${yStr}-${mStr}-${dStr}`,
        formattedText: `${dStr}.${mStr}.${yStr}`,
      };
    }
  } else if (parts.length === 1 && /^\d{8}$/.test(parts[0])) {
    const d = parseInt(parts[0].substring(0, 2), 10);
    const m = parseInt(parts[0].substring(2, 4), 10);
    const y = parseInt(parts[0].substring(4, 8), 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2020 && y <= 2050) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');
      const yStr = String(y);
      return {
        isoDate: `${yStr}-${mStr}-${dStr}`,
        formattedText: `${dStr}.${mStr}.${yStr}`,
      };
    }
  }

  return { isoDate: null, formattedText: null };
}

export function loadFromLocalStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (err) {
    console.warn(`Error loading ${key} from localStorage:`, err);
    return fallback;
  }
}

export function saveToLocalStorage<T>(key: string, value: T): void {
  try {
    // Strip or sanitize huge base64 image strings (> 20KB) to prevent LocalStorage Quota Exceeded
    let serializableValue = value;
    if (Array.isArray(value)) {
      serializableValue = value.map((item) => {
        if (item && typeof item === 'object' && 'imageUrl' in item && typeof item.imageUrl === 'string') {
          if (item.imageUrl.startsWith('data:image/') && item.imageUrl.length > 20000) {
            // Keep item intact without bloating localStorage with MBs of base64
            const { imageUrl, ...rest } = item;
            return rest;
          }
        }
        return item;
      }) as unknown as T;
    }
    localStorage.setItem(key, JSON.stringify(serializableValue));
  } catch (err) {
    console.warn(`Error saving ${key} to localStorage:`, err);
  }
}
