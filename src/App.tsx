import React, { useState, useEffect } from 'react';
import { MainTabType, Group, AppSettings, InventoryItem } from './types';
import { INITIAL_GROUPS, INITIAL_SETTINGS, INITIAL_INVENTORY } from './data/initialData';
import { loadFromLocalStorage, saveToLocalStorage } from './utils/helpers';
import { BottomNav } from './components/BottomNav';
import { InventarView } from './components/InventarView';
import { GruppeView } from './components/GruppeView';
import { SetupView } from './components/SetupView';
import { ScannerPage } from './components/ScannerPage';

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

  const currentGroup = groups.find((g) => g.isCurrent) || groups[0] || INITIAL_GROUPS[0];

  return (
    <div className="min-h-screen bg-[#161a16] text-[#e4ebe2] font-sans antialiased flex flex-col px-4 pt-3 pb-20 selection:bg-[#9fe870] selection:text-[#122108]">
      {/* Main Screen Views */}
      <main className="flex-1 max-w-lg w-full mx-auto">
        {activeTab === 'inventar' && (
          <InventarView
            inventory={inventory}
            setInventory={setInventory}
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
            setInventory={setInventory}
            onGoBack={() => setActiveTab('inventar')}
          />
        )}
        {activeTab === 'scanner' && (
          <ScannerPage
            onClose={() => setActiveTab('inventar')}
            onAddItem={(item) => {
              setInventory((prev) => [...prev, { ...item, id: `inv-${Date.now()}` }]);
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
