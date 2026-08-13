import React, { useState, useEffect } from 'react';
import { MainTabType, Group, AppSettings, InventoryItem } from './types';
import { INITIAL_GROUPS, INITIAL_SETTINGS, INITIAL_INVENTORY } from './data/initialData';
import { loadFromLocalStorage, saveToLocalStorage } from './utils/helpers';
import { BottomNav } from './components/BottomNav';
import { InventarView } from './components/InventarView';
import { GruppeView } from './components/GruppeView';
import { SetupView } from './components/SetupView';
import { ScannerPage } from './components/ScannerPage';
import {
  ensureAuth,
  subscribeToGroupItems,
  saveItemToFirebase,
  deleteItemFromFirebase,
  saveGroupToFirebase,
} from './services/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTabType>('inventar');

  // Groups State
  const [groups, setGroups] = useState<Group[]>(() =>
    loadFromLocalStorage('kuehlschrank_groups', INITIAL_GROUPS)
  );

  // Settings State
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadFromLocalStorage('kuehlschrank_settings', INITIAL_SETTINGS)
  );

  // Inventory Items State
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const data = loadFromLocalStorage('kuehlschrank_inventory', INITIAL_INVENTORY);
    return data.map((item, index) => ({ ...item, id: item.id || `inv-fallback-${Date.now()}-${index}` }));
  });

  const currentGroup = groups.find((g) => g.isCurrent) || groups[0] || INITIAL_GROUPS[0];

  // Initialize Firebase Auth on Mount
  useEffect(() => {
    ensureAuth().catch((err) => console.error('Firebase Auth init error:', err));
  }, []);

  // Subscribe to real-time Cloud Firestore updates ONLY if active group is joined (Cloud mode)
  useEffect(() => {
    if (!currentGroup?.id || !currentGroup.isJoined) return;

    // Save initial group structure to cloud
    saveGroupToFirebase(currentGroup).catch(console.error);

    const unsubscribe = subscribeToGroupItems(
      currentGroup.id,
      (cloudItems) => {
        if (cloudItems && cloudItems.length > 0) {
          setInventory((prev) => {
            const itemsOtherGroups = prev.filter(
              (it) => it.groupId !== currentGroup.id && Boolean(it.groupId)
            );
            return [...itemsOtherGroups, ...cloudItems];
          });
        }
      },
      (err) => {
        console.warn('Firestore subscription fallback:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentGroup?.id, currentGroup?.isJoined]);

  // Wrapped setInventory with optional Firebase automatic sync (only for joined cloud groups)
  const updateInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>> = (action) => {
    setInventory((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;

      if (!currentGroup?.isJoined) {
        return next;
      }

      const groupId = currentGroup.id;
      const prevGroupItems = prev.filter((it) => it.groupId === groupId || (!it.groupId && groupId === 'group-1'));
      const nextGroupItems = next.filter((it) => it.groupId === groupId || (!it.groupId && groupId === 'group-1'));

      // Sync additions and edits
      nextGroupItems.forEach((item) => {
        const itemWithGroup = { ...item, groupId };
        const prevItem = prevGroupItems.find((p) => p.id === item.id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(itemWithGroup)) {
          saveItemToFirebase(groupId, itemWithGroup).catch(console.error);
        }
      });

      // Sync deletions
      prevGroupItems.forEach((prevItem) => {
        if (!nextGroupItems.some((n) => n.id === prevItem.id)) {
          deleteItemFromFirebase(groupId, prevItem.id).catch(console.error);
        }
      });

      return next;
    });
  };

  // Sync to LocalStorage
  useEffect(() => {
    saveToLocalStorage('kuehlschrank_groups', groups);
  }, [groups]);

  useEffect(() => {
    saveToLocalStorage('kuehlschrank_settings', settings);
  }, [settings]);

  useEffect(() => {
    saveToLocalStorage('kuehlschrank_inventory', inventory);
  }, [inventory]);

  return (
    <div className="min-h-screen bg-[#161a16] text-[#e4ebe2] font-sans antialiased flex flex-col px-4 pt-3 pb-20 selection:bg-[#9fe870] selection:text-[#122108]">
      {/* Main Screen Views */}
      <main className="flex-1 max-w-lg w-full mx-auto">
        {activeTab === 'inventar' && (
          <InventarView
            inventory={inventory}
            setInventory={updateInventory}
            currentGroup={currentGroup}
            settings={settings}
            onOpenScanner={() => setActiveTab('scanner')}
          />
        )}

        {activeTab === 'gruppe' && (
          <GruppeView groups={groups} setGroups={setGroups} />
        )}

        {activeTab === 'setup' && (
          <SetupView
            settings={settings}
            setSettings={setSettings}
            inventory={inventory}
            setInventory={updateInventory}
            onGoBack={() => setActiveTab('inventar')}
          />
        )}
        {activeTab === 'scanner' && (
          <ScannerPage
            onClose={() => setActiveTab('inventar')}
            onAddItem={(item) => {
              updateInventory((prev) => {
                const existingIndex = prev.findIndex(
                  (existing) =>
                    existing.groupId === item.groupId &&
                    existing.location.toLowerCase() === item.location.toLowerCase() &&
                    existing.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
                    existing.mhd === item.mhd
                );

                if (existingIndex >= 0) {
                  const updated = [...prev];
                  const existing = updated[existingIndex];
                  updated[existingIndex] = {
                    ...existing,
                    quantity: (existing.quantity || 1) + (item.quantity || 1),
                  };
                  return updated;
                }

                return [...prev, { ...item, id: `inv-${Date.now()}` }];
              });
            }}
            settings={settings}
            currentLocations={currentGroup.locations}
            currentGroupId={currentGroup.id}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
