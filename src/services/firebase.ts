import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Group, InventoryItem } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Error {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  const jsonErr = JSON.stringify(errInfo);
  console.error('Firestore Error: ', jsonErr);
  return new Error(jsonErr);
}

// Connection test as mandated by skill instructions
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Auto-run connection check
testConnection();

export async function ensureAuth(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function loginWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  try {
    const res = await signInWithPopup(auth, provider);
    return res.user;
  } catch (err: any) {
    if (
      err?.code === 'auth/popup-closed-by-user' ||
      err?.code === 'auth/cancelled-popup-request'
    ) {
      console.warn('Google Sign-In popup closed by user.');
      return null;
    }
    console.warn('Google Sign-In failed:', err?.message || err);
    throw err;
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Realtime Firestore Group & Item syncing
export async function saveGroupToFirebase(group: Group): Promise<void> {
  await ensureAuth();
  const path = `groups/${group.id}`;
  try {
    const ref = doc(db, 'groups', group.id);
    await setDoc(
      ref,
      {
        id: group.id,
        name: group.name,
        locations: group.locations || ['Kühlschrank', 'Gefrierfach', 'Vorrat'],
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchGroupFromFirebase(groupId: string): Promise<Group | null> {
  await ensureAuth();
  const path = `groups/${groupId}`;
  try {
    const ref = doc(db, 'groups', groupId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: data.id || groupId,
        name: data.name || groupId,
        isCurrent: true,
        locations: data.locations || ['Kühlschrank', 'Gefrierfach', 'Vorrat'],
        isJoined: true,
      };
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

export async function saveItemToFirebase(
  groupId: string,
  item: InventoryItem
): Promise<void> {
  await ensureAuth();
  const path = `groups/${groupId}/items/${item.id}`;
  try {
    const ref = doc(db, 'groups', groupId, 'items', item.id);
    const payload: Record<string, any> = {
      id: item.id,
      name: item.name,
      mhd: item.mhd,
      location: item.location,
      quantity: item.quantity,
      groupId: groupId,
    };
    if (item.imageUrl) payload.imageUrl = item.imageUrl;
    if (item.categoryIcon) payload.categoryIcon = item.categoryIcon;
    if (item.category) payload.category = item.category;
    if (item.barcode) payload.barcode = item.barcode;
    if (typeof item.isEinlagerung === 'boolean') payload.isEinlagerung = item.isEinlagerung;
    if (typeof item.isOpen === 'boolean') payload.isOpen = item.isOpen;
    if (item.openedDate) payload.openedDate = item.openedDate;

    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteItemFromFirebase(
  groupId: string,
  itemId: string
): Promise<void> {
  await ensureAuth();
  const path = `groups/${groupId}/items/${itemId}`;
  try {
    const ref = doc(db, 'groups', groupId, 'items', itemId);
    await deleteDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeToGroupItems(
  groupId: string,
  onData: (items: InventoryItem[]) => void,
  onError?: (err: any) => void
): () => void {
  const path = `groups/${groupId}/items`;
  const itemsRef = collection(db, 'groups', groupId, 'items');
  
  return onSnapshot(
    itemsRef,
    (snap) => {
      const items: InventoryItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: data.id || d.id,
          name: data.name || 'Unbekannt',
          mhd: data.mhd || '',
          location: data.location || 'Kühlschrank',
          quantity: typeof data.quantity === 'number' ? data.quantity : 1,
          imageUrl: data.imageUrl,
          categoryIcon: data.categoryIcon,
          category: data.category,
          barcode: data.barcode,
          groupId: groupId,
          isEinlagerung: Boolean(data.isEinlagerung),
          isOpen: Boolean(data.isOpen),
          openedDate: data.openedDate,
        });
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
      if (onError) onError(error);
    }
  );
}

export function subscribeToGroupDoc(
  groupId: string,
  onData: (group: Partial<Group>) => void
): () => void {
  const path = `groups/${groupId}`;
  const groupRef = doc(db, 'groups', groupId);
  return onSnapshot(
    groupRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        onData({
          name: data.name,
          locations: data.locations,
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
