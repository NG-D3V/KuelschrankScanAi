import { Group, AppSettings, InventoryItem } from '../types';

export const INITIAL_GROUPS: Group[] = [
  {
    id: 'group-1',
    name: 'Offline WG',
    isCurrent: true,
    locations: ['Kühlschrank', 'Gefrierfach', 'Schrank'],
  },
  {
    id: 'group-2',
    name: 'Zuhause',
    isCurrent: false,
    locations: ['Kühlschrank', 'Vorratskammer', 'Gefrierschrank'],
  },
  {
    id: 'group-3',
    name: 'Büro',
    isCurrent: false,
    locations: ['Kühlschrank', 'Snackbox'],
  },
];

export const INITIAL_SETTINGS: AppSettings = {
  loadProductImages: true,
  saveImagesOffline: true,
  scannerCropOverlay: true,
  daysOrangeExpiry: 7,
  daysRedExpiry: 3,
  daysOrangeInFridge: 5,
  daysRedInFridge: 10,
};

export const INITIAL_INVENTORY: InventoryItem[] = [];

