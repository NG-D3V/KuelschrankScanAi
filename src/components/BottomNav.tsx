import React from 'react';
import { MainTabType } from '../types';
import { Settings, List, Users } from 'lucide-react';

interface BottomNavProps {
  activeTab: MainTabType;
  setActiveTab: (tab: MainTabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    {
      id: 'setup' as MainTabType,
      label: 'SETUP',
      icon: <Settings className="w-5 h-5" />,
    },
    {
      id: 'inventar' as MainTabType,
      label: 'INVENTAR',
      icon: <List className="w-5 h-5" />,
    },
    {
      id: 'gruppe' as MainTabType,
      label: 'GRUPPE',
      icon: <Users className="w-5 h-5" />,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#161a16] border-t border-[#2a3229] px-4 py-2">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-5 rounded-full transition cursor-pointer ${
                isActive ? 'text-[#e4ebe2]' : 'text-[#7f8e7d] hover:text-[#c2cebf]'
              }`}
            >
              <div
                className={`p-1.5 rounded-full transition ${
                  isActive ? 'bg-[#285e1b] text-[#a4ef72]' : ''
                }`}
              >
                {tab.icon}
              </div>
              <span className={`text-[11px] font-bold tracking-wider mt-0.5 ${isActive ? 'text-[#e4ebe2]' : 'text-[#7f8e7d]'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
