/**
 * Cloud sync with the real Firebase SDK against the official Auth + Firestore emulators (and the real rules).
 * Three independent accounts; a second "device" of the same account; isolation checked on the server side.
 */
import { readFileSync } from 'node:fs';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, useDatabase } from '../src/lib/db';
import { today } from '../src/lib/dates';
import { cloud, initCloud, login, logout, register, getProfile } from '../src/lib/firebase';
import { pushCloud, startCloudSync, stopCloudSync } from '../src/lib/cloudSync';
import { addFoodEntry, createFood, onLocalChange, saveBodyEntry } from '../src/lib/repo';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const until = async (fn: () => Promise<boolean>, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
const PW = 'Str0ng!pass';
const users: Record<string, string> = {};

beforeAll(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-mego', firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-mego/accounts', { method: 'DELETE' });
  initCloud({ apiKey: 'demo-key', authDomain: 'demo-mego.firebaseapp.com', projectId: 'demo-mego', emulator: { authUrl: 'http://127.0.0.1:9099', firestoreHost: '127.0.0.1', firestorePort: 8080 } });
});

async function device(name: string) { useDatabase(name); await db.open(); }
async function makeFood() {
  return createFood({ nameAr: 'صدر دجاج مشوي', nameEn: 'Grilled chicken breast', category: 'بروتين', per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, state: 'cooked', stateLabel: 'مطبوخ', prep: '', notes: '' });
}

describe('accounts + cloud sync (emulators)', () => {
  it('registration creates an active profile; age confirmation is required', async () => {
    await expect(register('nope@example.com', PW, 'X', 'SA', false)).rejects.toThrow('AGE_REQUIRED');
    for (const name of ['alice', 'bob', 'carol']) {
      const u = await register(`${name}@example.com`, PW, name, name === 'carol' ? 'DE' : 'SA', true);
      users[name] = u.uid;
      expect(await getProfile(u.uid)).toMatchObject({ status: 'active', email: `${name}@example.com`, ageConfirmed: true });
      await logout();
    }
  });

  it('each user logs on their own device database; records land only under their own uid', async () => {
    for (const name of ['alice', 'bob', 'carol']) {
      await device('cloud-' + name + '-phone');
      await login(`${name}@example.com`, PW);
      const f = await makeFood();
      await addFoodEntry(today(), 'lunch', f, name === 'alice' ? 200 : name === 'bob' ? 150 : 100, 'g');
      await saveBodyEntry(today(), { weight: name === 'alice' ? 70 : name === 'bob' ? 85 : 60 });
      const r = await pushCloud();
      expect(r.conflicts).toBe(0);
      expect(await db.outbox.count()).toBe(0);
      const mine = await getDocs(collection(cloud().fs, 'users', users[name], 'entries'));
      expect(mine.size).toBe(1);
      expect(JSON.parse(mine.docs[0].data().data).grams).toBe(name === 'alice' ? 200 : name === 'bob' ? 150 : 100);
      // trying to read someone else's records is refused by the server
      const other = name === 'alice' ? 'bob' : 'alice';
      if (users[other]) await expect(getDocs(collection(cloud().fs, 'users', users[other], 'entries'))).rejects.toThrow();
      await logout();
    }
  });

  it("a second device of the same user receives the data live; other users' data never appears", async () => {
    await device('cloud-alice-laptop');
    await login('alice@example.com', PW);
    startCloudSync(users.alice, (fn) => onLocalChange(fn));
    expect(await until(async () => (await db.entries.count()) === 1 && (await db.body.count()) === 1)).toBe(true);
    const e = (await db.entries.toArray())[0];
    expect(e.grams).toBe(200);
    expect((await db.body.toArray())[0].weight).toBe(70);
    // a change on this device reaches the cloud; nothing of bob/carol is here
    await addFoodEntry(today(), 'dinner', (await db.foods.toArray())[0], 50, 'g');
    expect(await until(async () => (await getDocs(collection(cloud().fs, 'users', users.alice, 'entries'))).size === 2)).toBe(true);
    expect((await db.entries.toArray()).every((x) => [200, 50].includes(x.grams))).toBe(true);
    stopCloudSync();
    await logout();
  });

  it('an older copy from an offline device does not overwrite the newer one', async () => {
    await device('cloud-alice-phone');
    await login('alice@example.com', PW);
    const e = (await db.entries.toArray())[0];
    await db.outbox.add({ table: 'entries', key: e.id, op: 'upsert', payload: { ...e, grams: 1, updatedAt: e.updatedAt - 10_000 }, at: e.updatedAt - 10_000 });
    const r = await pushCloud();
    expect(r.conflicts).toBe(1);
    const server = await getDoc(doc(cloud().fs, 'users', users.alice, 'entries', e.id));
    expect(JSON.parse(server.data()!.data).grams).toBe(200);
    await logout();
  });
});
