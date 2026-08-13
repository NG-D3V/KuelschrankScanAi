export type MainTabType = 'setup' | 'inventar' | 'gruppe' | 'scanner';

export type CategoryType = 
  | 'milchprodukte'
  | 'gemuese_obst'
  | 'fleisch_fisch'
  | 'saucen_dips'
  | 'getraenke'
  | 'vorrat_trocken'
  | 'suessigkeiten'
  | 'snacks_salzig'
  | 'tiefkuehl'
  | 'sonstiges';

export type StorageLocation = 'kuehlschrank' | 'gefrierfach' | 'vorratsschrank';

export interface Group {
  id: string;
  name: string;
  isCurrent: boolean;
  locations: string[];
  isJoined?: boolean;
}

export interface AppSettings {
  loadProductImages: boolean;
  saveImagesOffline: boolean;
  scannerCropOverlay: boolean;
  daysOrangeExpiry: number | "";
  daysRedExpiry: number | "";
  daysOrangeInFridge?: number | "";
  daysRedInFridge?: number | "";
}

export interface InventoryItem {
  id: string;
  name: string;
  mhd: string; // YYYY-MM-DD
  location: string;
  quantity: number;
  imageUrl?: string;
  categoryIcon?: string;
  category?: string;
  barcode?: string;
  groupId: string;
  isEinlagerung?: boolean;
  isOpen?: boolean;
  openedDate?: string;
}

export interface ScannedItemCandidate {
  name: string;
  category: string;
  storageLocation: string;
  estimatedQuantity: number;
  unit: string;
  freshnessScore: number;
  estimatedDaysUntilExpiry: number;
  notes?: string;
  selected?: boolean;
}

export interface ScanResult {
  detectedItems: ScannedItemCandidate[];
  overallSummary: string;
  fridgeOrganizingTips: string[];
}

export interface PwaStatus {
  isInstalled: boolean;
  canInstall: boolean;
  isOnline: boolean;
  hasServiceWorker: boolean;
  swState: 'installing' | 'activated' | 'redundant' | 'none';
}
