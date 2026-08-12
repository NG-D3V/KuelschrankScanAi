import React, { useState } from 'react';
import { Group } from '../types';
import { Pencil, Trash2, Smartphone, Plus, UserPlus, X } from 'lucide-react';

interface GruppeViewProps {
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

export const GruppeView: React.FC<GruppeViewProps> = ({ groups, setGroups }) => {
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupInputName, setGroupInputName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [locationInputName, setLocationInputName] = useState('');

  const currentGroup = groups.find((g) => g.isCurrent) || groups[0];

  const handleSelectGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        isCurrent: g.id === groupId,
      }))
    );
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupInputName.trim()) return;

    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: groupInputName.trim(),
      isCurrent: true,
      locations: ['Kühlschrank', 'Gefrierfach', 'Schrank'],
    };

    setGroups((prev) => [
      ...prev.map((g) => ({ ...g, isCurrent: false })),
      newGroup,
    ]);

    setGroupInputName('');
    setShowAddGroupModal(false);
  };

  const handleJoinGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;

    const joinedGroup: Group = {
      id: `group-${Date.now()}`,
      name: joinCodeInput.trim(),
      isCurrent: true,
      locations: ['Kühlschrank', 'Gefrierfach', 'Vorrat'],
    };

    setGroups((prev) => [
      ...prev.map((g) => ({ ...g, isCurrent: false })),
      joinedGroup,
    ]);

    setJoinCodeInput('');
    setShowJoinGroupModal(false);
  };

  const handleDeleteGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (groups.length <= 1) {
      alert('Du musst mindestens eine Gruppe behalten.');
      return;
    }
    if (confirm('Möchtest du diese Gruppe wirklich löschen?')) {
      setGroups((prev) => {
        const filtered = prev.filter((g) => g.id !== groupId);
        if (filtered.length > 0 && !filtered.some((g) => g.isCurrent)) {
          filtered[0].isCurrent = true;
        }
        return filtered;
      });
    }
  };

  const handleStartEditGroup = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setGroupInputName(group.name);
  };

  const handleSaveEditGroup = (groupId: string) => {
    if (!groupInputName.trim()) return;
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: groupInputName.trim() } : g))
    );
    setEditingGroupId(null);
    setGroupInputName('');
  };

  // Location handlers
  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationInputName.trim() || !currentGroup) return;

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === currentGroup.id) {
          if (g.locations.includes(locationInputName.trim())) return g;
          return { ...g, locations: [...g.locations, locationInputName.trim()] };
        }
        return g;
      })
    );

    setLocationInputName('');
    setShowAddLocationModal(false);
  };

  const handleDeleteLocation = (locationName: string) => {
    if (!currentGroup) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === currentGroup.id) {
          return { ...g, locations: g.locations.filter((loc) => loc !== locationName) };
        }
        return g;
      })
    );
  };

  return (
    <div className="space-y-6 pb-24 max-w-lg mx-auto">
      {/* Title */}
      <h1 className="text-3xl font-extrabold text-[#f0f4ef] tracking-tight pt-2">Gruppen & Orte</h1>

      {/* Card 1: Gruppen */}
      <div className="bg-[#232a23] rounded-3xl p-5 border border-[#2e372e] space-y-4 shadow-lg">
        <h2 className="text-[#a4ef72] text-sm font-bold tracking-wide">Gruppen</h2>

        {/* Group list */}
        <div className="space-y-2.5">
          {groups.map((group) => {
            const isSelected = group.isCurrent;
            const isEditing = editingGroupId === group.id;

            return (
              <div
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className={`flex items-center justify-between p-3.5 rounded-2xl transition cursor-pointer ${
                  isSelected
                    ? 'bg-[#1e4e12] text-[#f0f4ef] font-bold shadow-md'
                    : 'bg-[#1d221d] text-[#c2cebf] hover:bg-[#283028]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => handleStartEditGroup(group, e)}
                    className="p-1 text-[#8fa18d] hover:text-[#a4ef72] transition cursor-pointer"
                    title="Gruppe bearbeiten"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => handleDeleteGroup(group.id, e)}
                    className="p-1 text-[#e57373] hover:text-rose-400 transition cursor-pointer"
                    title="Gruppe löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {isEditing ? (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={groupInputName}
                        onChange={(e) => setGroupInputName(e.target.value)}
                        className="bg-[#161a16] text-[#f0f4ef] px-2 py-1 rounded-lg text-xs border border-[#364235] focus:outline-none"
                      />
                      <button
                        onClick={() => handleSaveEditGroup(group.id)}
                        className="text-xs bg-[#9fe870] text-[#122108] font-bold px-2 py-1 rounded-lg"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold">{group.name}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[#a4ef72]">
                  <Smartphone className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Group Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={() => {
              setGroupInputName('');
              setShowAddGroupModal(true);
            }}
            className="w-full py-3.5 rounded-full bg-[#9fe870] text-[#122108] font-black text-sm hover:bg-[#8ddb5a] transition cursor-pointer shadow-md flex items-center justify-center gap-2"
          >
            Gruppe hinzufügen
          </button>

          <button
            onClick={() => {
              setJoinCodeInput('');
              setShowJoinGroupModal(true);
            }}
            className="w-full py-3.5 rounded-full bg-[#1d221d] border border-[#3e4d3c] text-[#a4ef72] font-bold text-sm hover:bg-[#283028] transition cursor-pointer flex items-center justify-center gap-2"
          >
            Gruppe beitreten
          </button>
        </div>
      </div>

      {/* Card 2: Orte in Aktiver Gruppe */}
      {currentGroup && (
        <div className="bg-[#232a23] rounded-3xl p-5 border border-[#2e372e] space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-[#a4ef72] text-sm font-bold tracking-wide">
              Orte in {currentGroup.name}
            </h2>
            <button
              onClick={() => setShowAddLocationModal(true)}
              className="text-xs text-[#a4ef72] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Ort hinzufügen
            </button>
          </div>

          <div className="space-y-2.5">
            {currentGroup.locations.map((location) => (
              <div
                key={location}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#1d221d] text-[#c2cebf]"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const newName = prompt('Ort umbenennen:', location);
                      if (newName && newName.trim()) {
                        setGroups((prev) =>
                          prev.map((g) => {
                            if (g.id === currentGroup.id) {
                              return {
                                ...g,
                                locations: g.locations.map((loc) =>
                                  loc === location ? newName.trim() : loc
                                ),
                              };
                            }
                            return g;
                          })
                        );
                      }
                    }}
                    className="p-1 text-[#8fa18d] hover:text-[#a4ef72] cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteLocation(location)}
                    className="p-1 text-[#e57373] hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <span className="text-sm font-semibold">{location}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setShowAddGroupModal(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef]">Neue Gruppe erstellen</h3>
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Gruppenname (z.B. Ferienwohnung)"
                value={groupInputName}
                onChange={(e) => setGroupInputName(e.target.value)}
                className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-sm text-[#f0f4ef] focus:outline-none focus:border-[#9fe870]"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a] transition"
              >
                Erstellen
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {showJoinGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setShowJoinGroupModal(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef]">Gruppe beitreten</h3>
            <form onSubmit={handleJoinGroup} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Gruppen-Name oder Einladungscode"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-sm text-[#f0f4ef] focus:outline-none focus:border-[#9fe870]"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a] transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Beitreten
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setShowAddLocationModal(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef]">Neuen Ort hinzufügen</h3>
            <form onSubmit={handleAddLocation} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Ortsname (z.B. Keller, Gemüseschublade)"
                value={locationInputName}
                onChange={(e) => setLocationInputName(e.target.value)}
                className="w-full bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-3 text-sm text-[#f0f4ef] focus:outline-none focus:border-[#9fe870]"
              />
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a] transition"
              >
                Hinzufügen
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
