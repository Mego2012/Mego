/**
 * Accounts (Firebase Spark plan — free, no billing account). Loaded at runtime from ./firebase-config.json:
 * when that file is absent the app runs in guest (this-device-only) mode exactly as before.
 * The Firebase web config is a public identifier, not a secret; access is enforced by firebase/firestore.rules.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, type Auth, type User
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getCountFromServer, getDoc, getDocs, getFirestore, initializeFirestore, limit, orderBy, query, setDoc, updateDoc, where,
  type Firestore
} from 'firebase/firestore';

export interface CloudConfig {
  apiKey: string; authDomain: string; projectId: string; appId?: string;
  /** Apps Script web app that proxies the Gemini free tier for signed-in users. */
  aiBackendUrl?: string;
  /** Tests / local development: use the Firebase emulators. */
  emulator?: { authUrl: string; firestoreHost: string; firestorePort: number };
}

let cfg: CloudConfig | null = null;
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let fs: Firestore | null = null;

/** Reads ./firebase-config.json once. Returns null in guest-only deployments. */
export async function loadCloudConfig(): Promise<CloudConfig | null> {
  if (cfg) return cfg;
  try {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const r = await fetch(base + 'firebase-config.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = (await r.json()) as CloudConfig;
    if (!j.apiKey || !j.projectId) return null;
    cfg = j;
    return cfg;
  } catch {
    return null;
  }
}

export function initCloud(c: CloudConfig) {
  if (app) return;
  cfg = c;
  app = initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId });
  auth = getAuth(app);
  // Some networks (corporate proxies, some mobile carriers) buffer Firestore's streaming channel, so live updates never
  // arrive. Auto-detection switches those clients to long polling; the 10 s detection timeout keeps the switch quick.
  fs = c.emulator ? getFirestore(app) : initializeFirestore(app, { experimentalAutoDetectLongPolling: true, experimentalLongPollingOptions: { timeoutSeconds: 10 } });
  if (c.emulator) {
    connectAuthEmulator(auth, c.emulator.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(fs, c.emulator.firestoreHost, c.emulator.firestorePort);
  }
}
export const cloudReady = () => !!app;
export const cloudConfig = () => cfg;
export function cloud() { if (!auth || !fs) throw new Error('CLOUD_NOT_CONFIGURED'); return { auth, fs }; }

/* ------------------------------------------------------------------ accounts */

/** Countries where Google's free-tier Gemini terms require paid services for apps offered to users. */
export const AI_RESTRICTED_COUNTRIES = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'GB']);

export interface Profile { displayName: string; email: string; status: 'active' | 'suspended'; country: string; ageConfirmed: true; createdAt: number; lastActiveAt: number }

export async function register(email: string, password: string, displayName: string, country: string, ageConfirmed: boolean): Promise<User> {
  if (!ageConfirmed) throw new Error('AGE_REQUIRED');
  const { auth, fs } = cloud();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 40) });
  const now = Date.now();
  const p: Profile = { displayName: displayName.trim().slice(0, 40), email: cred.user.email ?? email.trim(), status: 'active', country: country.toUpperCase().slice(0, 2), ageConfirmed: true, createdAt: now, lastActiveAt: now };
  await setDoc(doc(fs, 'profiles', cred.user.uid), p);
  sendEmailVerification(cred.user).catch(() => {});
  return cred.user;
}

export async function login(email: string, password: string): Promise<User> {
  const { auth } = cloud();
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}
export async function logout() { await signOut(cloud().auth); }
export async function resetPassword(email: string) { await sendPasswordResetEmail(cloud().auth, email.trim()); }
export function onUser(fn: (u: User | null) => void) { return onAuthStateChanged(cloud().auth, fn); }
export function currentUser(): User | null { return auth?.currentUser ?? null; }

export async function getProfile(uid: string): Promise<Profile | null> {
  const s = await getDoc(doc(cloud().fs, 'profiles', uid));
  return s.exists() ? (s.data() as Profile) : null;
}
export async function touchProfile(uid: string) {
  try { await updateDoc(doc(cloud().fs, 'profiles', uid), { lastActiveAt: Date.now() }); } catch { /* offline or suspended */ }
}
export async function updateMyProfile(uid: string, change: Partial<Pick<Profile, 'displayName' | 'country'>>) {
  await updateDoc(doc(cloud().fs, 'profiles', uid), change);
}
export async function isAdmin(uid: string): Promise<boolean> {
  try { return (await getDoc(doc(cloud().fs, 'admins', uid))).exists(); } catch { return false; }
}

/** Deletes the Firebase account after re-entering the password (Google requires a recent sign-in). */
export async function deleteAccountAuth(password: string) {
  const u = cloud().auth.currentUser;
  if (!u || !u.email) throw new Error('NOT_SIGNED_IN');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  await deleteUser(u);
}

/* ------------------------------------------------------------------ admin (aggregates only — never private data) */

export async function adminStats() {
  const { fs } = cloud();
  const weekAgo = Date.now() - 7 * 86400_000;
  const [total, active, suspended, pending] = await Promise.all([
    getCountFromServer(collection(fs, 'profiles')),
    getCountFromServer(query(collection(fs, 'profiles'), where('lastActiveAt', '>=', weekAgo))),
    getCountFromServer(query(collection(fs, 'profiles'), where('status', '==', 'suspended'))),
    getCountFromServer(query(collection(fs, 'foodSubmissions'), where('status', '==', 'pending')))
  ]);
  return { total: total.data().count, active7d: active.data().count, suspended: suspended.data().count, pendingFoods: pending.data().count };
}
export async function adminListProfiles(max = 100) {
  const s = await getDocs(query(collection(cloud().fs, 'profiles'), orderBy('createdAt', 'desc'), limit(max)));
  return s.docs.map((d) => ({ uid: d.id, ...(d.data() as Profile) }));
}
export async function adminSetStatus(uid: string, status: 'active' | 'suspended') {
  await updateDoc(doc(cloud().fs, 'profiles', uid), { status });
}
export async function adminListErrors(max = 50) {
  const s = await getDocs(query(collection(cloud().fs, 'errorReports'), orderBy('at', 'desc'), limit(max)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as { at: number; kind: string; message: string; app: string }) }));
}
export async function reportError(kind: string, message: string) {
  try {
    if (!app || !auth?.currentUser) return;
    await setDoc(doc(collection(cloud().fs, 'errorReports')), { at: Date.now(), kind: kind.slice(0, 40), message: message.slice(0, 400), app: '1' });
  } catch { /* never let reporting break the app */ }
}

/* ------------------------------------------------------------------ shared food submissions */

export interface Submission { id: string; ownerUid: string; status: 'pending' | 'approved' | 'rejected'; at: number; food: Record<string, unknown> }

/** A user proposes one of their own foods for the shared database (never published automatically). */
export async function submitFood(food: { nameAr: string; nameEn: string; category: string; per100: Record<string, number>; state: string; pieceGrams?: number; notes: string; sourceRef?: string }) {
  const u = cloud().auth.currentUser;
  if (!u) throw new Error('NOT_SIGNED_IN');
  const { addDoc } = await import('firebase/firestore');
  await addDoc(collection(cloud().fs, 'foodSubmissions'), { ownerUid: u.uid, status: 'pending', at: Date.now(), food: JSON.parse(JSON.stringify(food)) });
}
export async function adminListSubmissions(): Promise<Submission[]> {
  const s = await getDocs(query(collection(cloud().fs, 'foodSubmissions'), where('status', '==', 'pending'), limit(100)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }));
}
/** Approve: copies the food into /foods (id "U-<submission>") and marks the submission; reject only marks it. */
export async function adminReview(sub: Submission, approve: boolean) {
  const { fs } = cloud();
  if (approve) {
    const f = sub.food as { nameAr?: string; nameEn?: string; category?: string; per100?: Record<string, number>; state?: string; pieceGrams?: number; notes?: string };
    await setDoc(doc(fs, 'foods', 'U-' + sub.id), JSON.parse(JSON.stringify({
      row: 0, sheetKey: 'U-' + sub.id, nameAr: f.nameAr ?? '', nameEn: f.nameEn ?? '', category: f.category ?? '', per100: f.per100, pieceGrams: f.pieceGrams,
      state: f.state ?? 'other', stateLabel: '', prep: '', notes: `${f.notes ?? ''} · user submission reviewed by admin`.trim()
    })));
  }
  await updateDoc(doc(fs, 'foodSubmissions', sub.id), { status: approve ? 'approved' : 'rejected' });
}
