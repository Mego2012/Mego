/**
 * Firestore security rules — executed by Google's official Firestore emulator (the real rules engine).
 * Run: npm run test:rules   (starts the emulator via firebase-tools)
 */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getCountFromServer, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const USERS = ['alice', 'bob', 'carol'];
const rec = (updatedAt: number, data: Record<string, unknown> = { kcal: 100 }) => ({ data: JSON.stringify(data), updatedAt });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-mego', firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const u of [...USERS, 'admin']) await setDoc(doc(db, 'profiles', u), { displayName: u, email: `${u}@example.com`, status: 'active', country: 'SA', ageConfirmed: true, createdAt: 1, lastActiveAt: 1 });
    await setDoc(doc(db, 'admins', 'admin'), { since: 1 });
    for (const u of USERS) await setDoc(doc(db, 'users', u, 'entries', 'e1'), rec(10, { name: `${u} lunch`, kcal: 500 }));
    await setDoc(doc(db, 'foods', 'F0001'), { nameAr: 'صدر دجاج', per100: { kcal: 165 } });
  });
});
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();

describe('private data isolation (3 users)', () => {
  it('each user reads and writes only their own records', async () => {
    for (const u of USERS) {
      await assertSucceeds(getDoc(doc(as(u), 'users', u, 'entries', 'e1')));
      await assertSucceeds(setDoc(doc(as(u), 'users', u, 'entries', 'e2'), rec(20)));
      for (const other of USERS.filter((x) => x !== u)) {
        await assertFails(getDoc(doc(as(u), 'users', other, 'entries', 'e1')));
        await assertFails(getDocs(collection(as(u), 'users', other, 'entries')));
        await assertFails(setDoc(doc(as(u), 'users', other, 'entries', 'e1'), rec(99)));
        await assertFails(deleteDoc(doc(as(u), 'users', other, 'entries', 'e1')));
      }
    }
  });
  it('changing the user id in the path does not help; signed-out requests are refused', async () => {
    await assertFails(getDoc(doc(as('alice'), 'users', 'bob', 'entries', 'e1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice', 'entries', 'e1')));
  });
  it('an older copy never overwrites a newer one; record shape is validated', async () => {
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'entries', 'e1'), rec(5)));
    await assertSucceeds(setDoc(doc(as('alice'), 'users', 'alice', 'entries', 'e1'), rec(11)));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'entries', 'x'), { data: '{}', updatedAt: 1, ownerUid: 'bob' }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'entries', 'y'), { data: { raw: 1 }, updatedAt: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'entries', 'z'), { data: 'x'.repeat(300001), updatedAt: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice', 'evilTable', 'x'), rec(1)));
  });
});

describe('administrator', () => {
  it('sees account cards and counts, never private records', async () => {
    const a = as('admin');
    await assertSucceeds(getCountFromServer(collection(a, 'profiles')));
    await assertSucceeds(getDoc(doc(a, 'profiles', 'alice')));
    for (const u of USERS) await assertFails(getDoc(doc(a, 'users', u, 'entries', 'e1')));
  });
  it('can suspend / reactivate but change nothing else in a profile', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'profiles', 'bob'), { status: 'suspended' }));
    await assertFails(updateDoc(doc(as('admin'), 'profiles', 'bob'), { displayName: 'hacked' }));
    await assertFails(updateDoc(doc(as('admin'), 'profiles', 'bob'), { status: 'deleted' }));
  });
  it('a suspended user is blocked by the server', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await updateDoc(doc(ctx.firestore(), 'profiles', 'bob'), { status: 'suspended' }); });
    await assertFails(getDoc(doc(as('bob'), 'users', 'bob', 'entries', 'e1')));
    await assertFails(setDoc(doc(as('bob'), 'users', 'bob', 'entries', 'e2'), rec(30)));
    await assertFails(updateDoc(doc(as('bob'), 'profiles', 'bob'), { status: 'active' }));
  });
  it('nobody can make themselves admin; regular users cannot list profiles', async () => {
    await assertFails(setDoc(doc(as('alice'), 'admins', 'alice'), { since: 1 }));
    await assertFails(getDocs(collection(as('alice'), 'profiles')));
    await assertFails(updateDoc(doc(as('alice'), 'profiles', 'alice'), { status: 'active', email: 'x@y.z' }));
  });
});

describe('shared food database', () => {
  it('everyone reads, only admins write; submissions are reviewed', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'foods', 'F0001')));
    await assertFails(setDoc(doc(as('alice'), 'foods', 'F0001'), { nameAr: 'x', per100: { kcal: 1 } }));
    await assertSucceeds(setDoc(doc(as('admin'), 'foods', 'F0002'), { nameAr: 'تونة', per100: { kcal: 116 } }));
    await assertSucceeds(setDoc(doc(as('alice'), 'foodSubmissions', 's1'), { ownerUid: 'alice', status: 'pending', nameAr: 'كعك', per100: { kcal: 400 } }));
    await assertFails(setDoc(doc(as('alice'), 'foodSubmissions', 's2'), { ownerUid: 'bob', status: 'pending' }));
    await assertFails(setDoc(doc(as('alice'), 'foodSubmissions', 's3'), { ownerUid: 'alice', status: 'approved' }));
    await assertFails(getDoc(doc(as('bob'), 'foodSubmissions', 's1')));
    await assertSucceeds(updateDoc(doc(as('admin'), 'foodSubmissions', 's1'), { status: 'approved' }));
  });
});

describe('registration & error reports', () => {
  it('a new user creates only their own active profile with age confirmation and their real email', async () => {
    const d = as('dave');
    const p = { displayName: 'Dave', email: 'dave@example.com', status: 'active', country: 'EG', ageConfirmed: true, createdAt: 2, lastActiveAt: 2 };
    await assertFails(setDoc(doc(d, 'profiles', 'dave'), { ...p, status: 'admin' }));
    await assertFails(setDoc(doc(d, 'profiles', 'dave'), { ...p, ageConfirmed: false }));
    await assertFails(setDoc(doc(d, 'profiles', 'dave'), { ...p, email: 'alice@example.com' }));
    await assertFails(setDoc(doc(d, 'profiles', 'alice'), p));
    await assertSucceeds(setDoc(doc(d, 'profiles', 'dave'), p));
  });
  it('error reports: users write small reports, only admins read', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'errorReports', 'r1'), { at: 1, kind: 'sync', message: 'timeout', app: '1' }));
    await assertFails(setDoc(doc(as('alice'), 'errorReports', 'r2'), { at: 1, kind: 'sync', message: 'x', app: '1', diary: 'private' }));
    await assertFails(getDoc(doc(as('alice'), 'errorReports', 'r1')));
    await assertSucceeds(getDoc(doc(as('admin'), 'errorReports', 'r1')));
  });
});
