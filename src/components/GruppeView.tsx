import React, { useState } from 'react';
import { Group } from '../types';
import { Pencil, Trash2, Smartphone, Cloud, Plus, UserPlus, X, AlertTriangle, Key, Settings } from 'lucide-react';
import { saveGroupToFirebase, fetchGroupFromFirebase } from '../services/firebase';

interface GruppeViewProps {
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

export const GruppeView: React.FC<GruppeViewProps> = ({ groups, setGroups }) => {
  // Modals
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showJoinGroupModal, setShowJoinGroupModal] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [editingFirebaseGroup, setEditingFirebaseGroup] = useState<Group | null>(null);

  // Delete Confirmation Modals State
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'group' | 'location';
    id: string;
    name: string;
  } | null>(null);
  const [showLastGroupWarning, setShowLastGroupWarning] = useState(false);

  // Form Inputs
  const [groupInputName, setGroupInputName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Join Firebase Form
  const [joinFirebaseName, setJoinFirebaseName] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // Firebase Config Edit Form
  const [editFbName, setEditFbName] = useState('');
  const [editFbUsername, setEditFbUsername] = useState('');
  const [editFbPassword, setEditFbPassword] = useState('');

  // Add Location Form
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

  // 1. Create Local Group (100% Offline)
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupInputName.trim()) return;

    const newGroup: Group = {
      id: `local-group-${Date.now()}`,
      name: groupInputName.trim(),
      isCurrent: true,
      locations: ['Kühlschrank', 'Gefrierfach', 'Schrank'],
      isJoined: false, // Purely local group
    };

    setGroups((prev) => [
      ...prev.map((g) => ({ ...g, isCurrent: false })),
      newGroup,
    ]);

    setGroupInputName('');
    setShowAddGroupModal(false);
  };

  // 2. Join Firebase Cloud Group (With Firebase Name, Username, Password)
  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const fbName = joinFirebaseName.trim();
    if (!fbName) return;

    const groupId = `cloud-${fbName.toLowerCase().replace(/[^a-z0-9]/g, '-') || Date.now()}`;

    let cloudGroup: Group | null = null;
    try {
      cloudGroup = await fetchGroupFromFirebase(groupId);
    } catch (err) {
      console.warn('Firebase group fetch warning:', err);
    }

    const joinedGroup: Group = {
      id: groupId,
      name: fbName,
      isCurrent: true,
      locations: cloudGroup?.locations || ['Kühlschrank', 'Gefrierfach', 'Vorrat'],
      isJoined: true,
      firebaseName: fbName,
      username: joinUsername.trim(),
      password: joinPassword.trim(),
    };

    setGroups((prev) => {
      const exists = prev.some((g) => g.id === joinedGroup.id);
      if (exists) {
        return prev.map((g) =>
          g.id === joinedGroup.id
            ? {
                ...g,
                isCurrent: true,
                firebaseName: fbName,
                username: joinUsername.trim(),
                password: joinPassword.trim(),
                isJoined: true,
              }
            : { ...g, isCurrent: false }
        );
      }
      return [...prev.map((g) => ({ ...g, isCurrent: false })), joinedGroup];
    });

    try {
      await saveGroupToFirebase(joinedGroup);
    } catch (err) {
      console.error('Group save error:', err);
    }

    setJoinFirebaseName('');
    setJoinUsername('');
    setJoinPassword('');
    setShowJoinGroupModal(false);
  };

  // 3. Request Delete Group / Location (Opens Popup)
  const onRequestDeleteGroup = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (groups.length <= 1) {
      setShowLastGroupWarning(true);
      return;
    }
    setConfirmDelete({
      type: 'group',
      id: group.id,
      name: group.name,
    });
  };

  const onRequestDeleteLocation = (locationName: string) => {
    setConfirmDelete({
      type: 'location',
      id: locationName,
      name: locationName,
    });
  };

  // Execute Deletion after Confirmation Popup
  const handleConfirmDelete = () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === 'group') {
      const groupId = confirmDelete.id;
      setGroups((prev) => {
        const filtered = prev.filter((g) => g.id !== groupId);
        if (filtered.length > 0 && !filtered.some((g) => g.isCurrent)) {
          filtered[0].isCurrent = true;
        }
        return filtered;
      });
    } else if (confirmDelete.type === 'location') {
      const locName = confirmDelete.id;
      if (currentGroup) {
        setGroups((prev) =>
          prev.map((g) => {
            if (g.id === currentGroup.id) {
              return { ...g, locations: g.locations.filter((loc) => loc !== locName) };
            }
            return g;
          })
        );
      }
    }

    setConfirmDelete(null);
  };

  // Group Name Editing
  const handleStartEditGroup = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroupId(group.id);
    setGroupInputName(group.name);
  };

  const handleSaveEditGroup = async (groupId: string) => {
    if (!groupInputName.trim()) return;
    const updatedName = groupInputName.trim();
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          const updated = { ...g, name: updatedName };
          if (updated.isJoined) {
            saveGroupToFirebase(updated).catch(console.error);
          }
          return updated;
        }
        return g;
      })
    );
    setEditingGroupId(null);
    setGroupInputName('');
  };

  // Switch / Edit Firebase Settings on a Group
  const handleOpenFirebaseEdit = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFirebaseGroup(group);
    setEditFbName(group.firebaseName || group.name || '');
    setEditFbUsername(group.username || '');
    setEditFbPassword(group.password || '');
  };

  const handleSaveFirebaseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFirebaseGroup) return;

    const updatedFbName = editFbName.trim();
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === editingFirebaseGroup.id) {
          const updated: Group = {
            ...g,
            isJoined: true,
            firebaseName: updatedFbName,
            username: editFbUsername.trim(),
            password: editFbPassword.trim(),
            name: updatedFbName || g.name,
          };
          saveGroupToFirebase(updated).catch(console.error);
          return updated;
        }
        return g;
      })
    );

    setEditingFirebaseGroup(null);
  };

  // Toggle Mode (Cloud vs Local)
  const handleToggleGroupCloudMode = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === group.id) {
          const updated = { ...g, isJoined: !g.isJoined };
          if (updated.isJoined) {
            saveGroupToFirebase(updated).catch(console.error);
          }
          return updated;
        }
        return g;
      })
    );
  };

  // Add Location
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

  return (
    <div className="space-y-6 pb-24 max-w-lg mx-auto">
      {/* Title */}
      <h1 className="text-3xl font-extrabold text-[#f0f4ef] tracking-tight pt-2">Gruppen & Orte</h1>

      {/* Card 1: Gruppen */}
      <div className="bg-[#232a23] rounded-3xl p-5 border border-[#2e372e] space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-[#a4ef72] text-sm font-bold tracking-wide">Gruppen</h2>
          <span className="text-xs text-[#8fa18d]">Tippe zum Auswählen</span>
        </div>

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
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <button
                    onClick={(e) => handleStartEditGroup(group, e)}
                    className="p-1 text-[#8fa18d] hover:text-[#a4ef72] transition cursor-pointer shrink-0"
                    title="Gruppe umbenennen"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => onRequestDeleteGroup(group, e)}
                    className="p-1 text-[#e57373] hover:text-rose-400 transition cursor-pointer shrink-0"
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
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate">{group.name}</span>
                      {group.isJoined && group.username && (
                        <span className="text-[10px] text-[#8fa18d] font-normal truncate">
                          Benutzer: {group.username}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Action & Cloud Toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  {group.isJoined ? (
                    <button
                      onClick={(e) => handleOpenFirebaseEdit(group, e)}
                      className="p-1.5 rounded-xl bg-[#183910] text-cyan-400 border border-cyan-500/30 hover:bg-[#224e16] transition flex items-center gap-1 text-xs"
                      title="Firebase Cloud Details & Passwort bearbeiten"
                    >
                      <Cloud className="w-4 h-4 text-cyan-400" />
                      <Key className="w-3 h-3 text-cyan-300" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleToggleGroupCloudMode(group, e)}
                      className="p-1.5 rounded-xl bg-[#181f18] text-[#8fa18d] hover:text-[#a4ef72] hover:bg-[#222a22] transition flex items-center gap-1 text-xs"
                      title="Zu Firebase Cloud-Gruppe umwandeln"
                    >
                      <Smartphone className="w-4 h-4 text-[#a4ef72]" />
                      <span className="text-[10px] hidden sm:inline">Lokal</span>
                    </button>
                  )}
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
            <Plus className="w-4 h-4" /> Lokale Gruppe erstellen
          </button>

          <button
            onClick={() => {
              setJoinFirebaseName('');
              setJoinUsername('');
              setJoinPassword('');
              setShowJoinGroupModal(true);
            }}
            className="w-full py-3.5 rounded-full bg-[#1d221d] border border-[#3e4d3c] text-[#a4ef72] font-bold text-sm hover:bg-[#283028] transition cursor-pointer flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" /> Firebase Gruppe beitreten
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
                    title="Ort umbenennen"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onRequestDeleteLocation(location)}
                    className="p-1 text-[#e57373] hover:text-rose-400 cursor-pointer"
                    title="Ort löschen"
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

      {/* --- MODALS --- */}

      {/* 1. Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative shadow-2xl">
            <button
              onClick={() => setConfirmDelete(null)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-[#f0f4ef]">
                {confirmDelete.type === 'group' ? 'Gruppe löschen?' : 'Ort löschen?'}
              </h3>
            </div>
            <p className="text-sm text-[#c2cebf]">
              Möchtest du {confirmDelete.type === 'group' ? 'die Gruppe' : 'den Ort'}{' '}
              <strong className="text-[#f0f4ef]">"{confirmDelete.name}"</strong> wirklich unwiderruflich löschen?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-full bg-[#1d221d] border border-[#3e4d3c] text-[#c2cebf] font-bold text-sm hover:bg-[#283028]"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-3 rounded-full bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 shadow-md"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Last Group Warning Modal */}
      {showLastGroupWarning && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative shadow-2xl">
            <button
              onClick={() => setShowLastGroupWarning(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-[#f0f4ef]">Löschen nicht möglich</h3>
            </div>
            <p className="text-sm text-[#c2cebf]">
              Du musst mindestens eine Gruppe behalten, um Vorratsdaten zu verwalten.
            </p>
            <button
              onClick={() => setShowLastGroupWarning(false)}
              className="w-full py-3 rounded-full bg-[#9fe870] text-[#122108] font-bold text-sm hover:bg-[#8ddb5a]"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}

      {/* 3. Add Local Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setShowAddGroupModal(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-[#f0f4ef]">Neue lokale Gruppe</h3>
            <p className="text-xs text-[#8fa18d]">Lokale Gruppen funktionieren 100% offline ohne Cloud.</p>
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Gruppenname (z.B. Ferienwohnung)"
                value={groupInputName}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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

      {/* 4. Join Firebase Group Modal (With Firebase Name, Username, Password) */}
      {showJoinGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setShowJoinGroupModal(false)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-[#f0f4ef]">Firebase Gruppe beitreten</h3>
            </div>
            <form onSubmit={handleJoinGroup} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Firebase Gruppen-Name</label>
                <input
                  type="text"
                  required
                  placeholder="z.B. Familie Müller"
                  value={joinFirebaseName}
                  onChange={(e) => setJoinFirebaseName(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Benutzername</label>
                <input
                  type="text"
                  required
                  placeholder="z.B. Max"
                  value={joinUsername}
                  onChange={(e) => setJoinUsername(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Passwort / PIN</label>
                <input
                  type="password"
                  required
                  placeholder="Passwort eingeben"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 rounded-full bg-cyan-500 text-slate-950 font-black text-sm hover:bg-cyan-400 transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Firebase Gruppe Beitreten
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. Firebase Cloud Settings / Edit Credentials Modal */}
      {editingFirebaseGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#232a23] border border-[#2e372e] rounded-3xl p-6 max-w-sm w-full space-y-4 relative">
            <button
              onClick={() => setEditingFirebaseGroup(null)}
              className="absolute top-4 right-4 text-[#8fa18d] hover:text-[#f0f4ef]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-[#f0f4ef]">Firebase Details bearbeiten</h3>
            </div>
            <p className="text-xs text-[#8fa18d]">
              Hier kannst du die Zugangsdaten für diese Firebase-Gruppe anpassen oder wechseln.
            </p>
            <form onSubmit={handleSaveFirebaseEdit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Firebase Gruppen-Name</label>
                <input
                  type="text"
                  required
                  value={editFbName}
                  onChange={(e) => setEditFbName(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Benutzername</label>
                <input
                  type="text"
                  value={editFbUsername}
                  onChange={(e) => setEditFbUsername(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8fa18d]">Passwort / PIN</label>
                <input
                  type="password"
                  value={editFbPassword}
                  onChange={(e) => setEditFbPassword(e.target.value)}
                  className="w-full mt-1 bg-[#161a16] border border-[#3e4d3c] rounded-2xl px-4 py-2.5 text-sm text-[#f0f4ef] focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    handleToggleGroupCloudMode(editingFirebaseGroup, e);
                    setEditingFirebaseGroup(null);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#1d221d] border border-[#3e4d3c] text-rose-300 font-bold text-xs"
                >
                  In Lokale Gruppe umwandeln
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs hover:bg-cyan-400 transition"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Add Location Modal */}
      {showAddLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
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
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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
