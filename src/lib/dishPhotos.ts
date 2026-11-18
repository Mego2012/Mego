/**
 * Dish photography: a curated, freely licensed EXAMPLE photo of a finished dish, per library recipe id
 * (Wikimedia Commons; see public/dish-img/CREDITS.md and docs/launch/MEGO_IMAGE_LICENSES.md).
 * Only recipes whose photo genuinely shows the same kind of dish have an entry; every other recipe keeps its
 * ingredient mosaic / drawn placeholder. The UI labels these as example photos, never as the exact recipe.
 */
import type { PhotoCredit } from './foodPhotos';

let manifest: Promise<Record<string, PhotoCredit>> | null = null;
let manifestSync: Record<string, PhotoCredit> | null = null;
const base = () => (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function loadDishManifest(): Promise<Record<string, PhotoCredit>> {
  if (!manifest) {
    manifest = fetch(base() + 'dish-img/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      .then((m: Record<string, PhotoCredit>) => (manifestSync = m));
  }
  return manifest;
}
export const dishManifestNow = () => manifestSync;
export function dishCredit(recipeId: string): PhotoCredit | null {
  return manifestSync?.[recipeId] ?? null;
}
export function dishPhotoUrl(recipeId: string): string | null {
  const m = dishCredit(recipeId);
  return m ? base() + 'dish-img/' + m.file : null;
}
