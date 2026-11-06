import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { cameraScanSupported, findLocalByBarcode, lookupBarcode, validBarcode, type ExternalProduct } from '../lib/barcode';
import { createFood } from '../lib/repo';
import type { Food } from '../lib/types';
import { NumField, Sheet, TextField, useAsync } from './ui';

/** Scan or type a barcode → local match, or Open Food Facts lookup → review → save as a custom food. */
export function BarcodeSheet({ onFood, onClose }: { onFood: (f: Food) => void; onClose: () => void }) {
  const { t, toast } = useApp();
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<ExternalProduct | null>(null);
  const [msg, setMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { run, busy } = useAsync();
  const supported = cameraScanSupported();

  const handle = async (c: string) => {
    setMsg('');
    setCode(c);
    const local = await findLocalByBarcode(c);
    if (local) {
      toast(t('localMatch'));
      onFood(local);
      return;
    }
    try {
      const p = await lookupBarcode(c);
      if (!p) setMsg(t('barcodeNotFound'));
      setProduct(p ?? { barcode: c, name: '', brand: '', per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, complete: false });
    } catch {
      setMsg(t('barcodeLookupFailed'));
      setProduct({ barcode: c, name: '', brand: '', per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, complete: false });
    }
  };

  useEffect(() => {
    if (!supported || product) return;
    let stop = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        while (!stop) {
          const codes = await detector.detect(videoRef.current).catch(() => []);
          if (codes.length) {
            stop = true;
            handle(codes[0].rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch {
        setMsg(t('cameraNotSupported'));
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, product]);

  return (
    <Sheet title={t('scanBarcode')} onClose={onClose}>
      {!product ? (
        <div className="stack" data-testid="barcode-sheet">
          {supported ? <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 260 }} /> : <div className="banner info small">{t('cameraNotSupported')}</div>}
          <div className="row">
            <input className="input grow num" inputMode="numeric" placeholder={t('enterBarcode')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} data-testid="barcode-input" />
            <button className="btn primary" disabled={!validBarcode(code) || busy} onClick={() => run(() => handle(code))} data-testid="barcode-lookup">{t('lookUp')}</button>
          </div>
          {msg && <div className="banner error small">{msg}</div>}
        </div>
      ) : (
        <ProductForm product={product} note={msg} onSaved={(f) => onFood(f)} />
      )}
    </Sheet>
  );
}

export function ProductForm({ product, note, onSaved }: { product: ExternalProduct; note: string; onSaved: (f: Food) => void }) {
  const { t } = useApp();
  const [v, setV] = useState({ name: product.name, brand: product.brand, ...product.per100, piece: product.servingGrams ?? ('' as number | '') });
  const { run, busy } = useAsync();
  const external = !!product.name;
  return (
    <div className="stack" data-testid="barcode-product">
      {note && <div className="banner error small">{note}</div>}
      {external && <div className="banner info tiny">{t('externalSource')}</div>}
      <TextField label={t('name')} value={v.name} onChange={(x) => setV({ ...v, name: x })} testId="bp-name" />
      <TextField label={t('brand')} value={v.brand} onChange={(x) => setV({ ...v, brand: x })} />
      <div className="small bold">{t('per100')}</div>
      <div className="grid4">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <NumField key={k} label={t(k)} value={v[k]} onChange={(x) => setV({ ...v, [k]: x === '' ? 0 : x })} testId={`bp-${k}`} />)}
      </div>
      <div className="grid3">
        {(['fiber', 'sugar', 'sodium'] as const).map((k) => <NumField key={k} label={t(k)} suffix={k === 'sodium' ? t('mg') : t('g')} value={v[k] ?? ''} onChange={(x) => setV({ ...v, [k]: x === '' ? undefined : x })} />)}
      </div>
      <NumField label={t('pieceWeight')} value={v.piece} onChange={(x) => setV({ ...v, piece: x })} />
      <div className="tiny muted">{t('barcode')}: {product.barcode}</div>
      <button className="btn primary block" disabled={busy || !v.name.trim() || !(v.kcal > 0)} data-testid="bp-save"
        onClick={async () => {
          const per100 = { kcal: Number(v.kcal), protein: Number(v.protein), carbs: Number(v.carbs), fat: Number(v.fat), ...(v.fiber !== undefined ? { fiber: Number(v.fiber) } : {}), ...(v.sugar !== undefined ? { sugar: Number(v.sugar) } : {}), ...(v.sodium !== undefined ? { sodium: Number(v.sodium) } : {}), ...(v.satFat !== undefined ? { satFat: Number(v.satFat) } : {}) };
          const f = await run(() => createFood({
            nameAr: v.name.trim(), nameEn: '', category: v.brand ? 'منتجات' : '', per100, state: 'other', stateLabel: '—', prep: '', notes: external ? 'Open Food Facts — external data, verify with label' : '',
            pieceGrams: v.piece === '' ? undefined : Number(v.piece), source: external ? 'openfoodfacts' : 'custom', barcode: product.barcode, brand: v.brand
          }));
          if (f) onSaved(f);
        }}>{t('saveAndLog')}</button>
    </div>
  );
}
