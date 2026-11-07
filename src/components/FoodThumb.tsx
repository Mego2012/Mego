import { useEffect, useState } from 'react';
import { groupFromText, loadPhotoManifest, photoGroupOf, photoKeyFor, photoManifestNow, photoUrl, type PhotoGroup } from '../lib/foodPhotos';

/** Placeholder glyphs per food group: drawn, never a stand-in photo. */
const GLYPH: Record<PhotoGroup, string> = {
  protein: 'M7 15c-2-3 0-8 5-9 4-.8 7 2 6 6-1 4-6 6-9 5l-3 3-2-2 3-3Z',
  dairy: 'M9 3h6v3l2 4v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l2-4V3Zm-2 9h10',
  legume: 'M8 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm8 2a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-5 5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
  grain: 'M12 21V9m0 0c-3 0-4-3-4-5 2 0 4 1 4 5Zm0 0c3 0 4-3 4-5-2 0-4 1-4 5Zm0 5c-3 0-4-3-4-5 2 0 4 1 4 5Zm0 0c3 0 4-3 4-5-2 0-4 1-4 5Z',
  fruit: 'M12 7c-4-2-8 1-7 6 1 5 4 8 7 7 3 1 6-2 7-7 1-5-3-8-7-6Zm0 0c0-2 1-3 3-4',
  veg: 'M5 19 15 9m0 0c1-3 4-5 5-4s-1 4-5 4Zm0 0-6 6c-2 2-5 1-4-1l6-6',
  fat: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z',
  nut: 'M12 4c4 0 7 3 7 8s-3 8-7 8-7-3-7-8 3-8 7-8Zm0 0v16',
  sweet: 'M6 10h12l-2 9H8l-2-9Zm2 0a4 4 0 0 1 8 0',
  drink: 'M7 4h10l-1 16H8L7 4Zm0 5h10',
  other: 'M4 13h16a8 8 0 0 1-16 0Zm8-4V5'
};

export function PhotoPlaceholder({ group, size }: { group: PhotoGroup; size?: number }) {
  return (
    <span className={`food-ph g-${group}`} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={GLYPH[group]} /></svg>
    </span>
  );
}

/**
 * A food's photo (lazy, async-decoded, cached offline by the service worker) or a designed placeholder.
 * Pass `photoKey` when the caller already knows it (e.g. ranking catalog), otherwise it is derived from the food.
 */
export function FoodThumb({ food, photoKey, size = 44, className = '', category }: {
  food?: { nameEn?: string; nameAr?: string; sourceRef?: string; id?: string; category?: string };
  photoKey?: string | null; size?: number; className?: string; category?: string;
}) {
  const key = photoKey !== undefined ? photoKey : food ? photoKeyFor(food) : null;
  const [ready, setReady] = useState(!!photoManifestNow());
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (!ready && key) loadPhotoManifest().then(() => setReady(true)); }, [ready, key]);
  const url = key && ready ? photoUrl(key) : null;
  const group = key ? photoGroupOf(key) : groupFromText(category ?? food?.category, food?.nameEn ?? food?.nameAr);
  return (
    <span className={`food-thumb ${className}`} style={{ width: size, height: size }}>
      {(!url || failed || !loaded) && <PhotoPlaceholder group={group} />}
      {url && !failed && (
        <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className={loaded ? 'in' : ''}
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
    </span>
  );
}
