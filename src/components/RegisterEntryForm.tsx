'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Truck, Undo2, ScanLine, Camera } from 'lucide-react';
import {
  PLATFORMS, PLATFORM_LABELS, Platform, MAX_TRACKING_LEN, normalizeTracking,
  RETURN_CONDITIONS, RETURN_CONDITION_LABELS, RETURN_CONDITION_HINTS, ReturnCondition,
} from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { ProductPicker, PickerProduct } from '@/components/ProductPicker';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

/** Everything after the first "-" — marketplace SKUs sometimes use a different
 *  brand prefix (RR-/R-/RRC-) for the same physical variant, same convention
 *  stock-manager's own stockSkuFor/addPending already use. */
function suffixOf(sku: string) {
  const idx = sku.indexOf('-');
  return idx === -1 ? sku : sku.slice(idx + 1);
}

/** One resolved line item from a scanned Myntra return tracking ID — a
 *  multi-item shipment resolves to several of these, not just one, so this
 *  is always handled as a list, never a single value. */
interface MyntraCandidate {
  resolvedSku: string; // the SKU string Myntra itself returned
  matchedSku: string | null; // this page's own matching SKU, or null if none matched
  productName: string | null; // this page's own product name for matchedSku
  image: string | null;
  returnReason: string | null;
  size: string | null;
  color: string | null;
  matchError: string | null;
  added: boolean;
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (local)
}

function qtyColor(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

const ACTIONS = [
  { key: 'PRODUCE', label: 'Produce', help: 'made new units (+)', tone: 'bg-emerald-600', Icon: Plus },
  { key: 'SHIP', label: 'Ship', help: 'sent to customer (−)', tone: 'bg-blue-600', Icon: Truck },
  { key: 'RETURN', label: 'Return', help: 'came back (+)', tone: 'bg-amber-600', Icon: Undo2 },
] as const;

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

type ActionKey = (typeof ACTIONS)[number]['key'];

/** `lockedAction` embeds this form pre-set to one action with no Produce/Ship/Return
 *  toggle shown — used on the Returns page, where only logging a Return makes sense. */
export function RegisterEntryForm({ products, lockedAction }: { products: PickerProduct[]; lockedAction?: ActionKey }) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [action, setAction] = useState<ActionKey>(lockedAction ?? 'PRODUCE');
  // Returns default to Myntra (most returns come from there); Stock Log's
  // own Ship/Return still defaults to Amazon, unchanged.
  const [channel, setChannel] = useState<Platform>(lockedAction === 'RETURN' ? 'MYNTRA' : 'AMAZON');
  // Returns default to qty 1 — the action-toggle row (where this normally
  // gets set on click) is hidden when locked, so it has to happen here instead.
  const [qty, setQty] = useState(lockedAction === 'RETURN' ? '1' : '');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tracking, setTracking] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [condition, setCondition] = useState<ReturnCondition>('GOOD');
  const [myntraScanId, setMyntraScanId] = useState('');
  const [myntraResolving, setMyntraResolving] = useState(false);
  const [myntraResolveError, setMyntraResolveError] = useState<string | null>(null);
  // Every item found for the last scan — could be 1, could be several (a
  // multi-item shipment resolves to one candidate per product). Not cleared
  // between individual "Add this" clicks, so all of them stay pickable off
  // one scan.
  const [myntraCandidates, setMyntraCandidates] = useState<MyntraCandidate[]>([]);
  // Whichever candidate is currently loaded into the "scan the label" modal.
  const [myntraActive, setMyntraActive] = useState<MyntraCandidate | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Default the date to today on the client (after mount, to avoid an SSR
  // hydration mismatch since the server doesn't know the user's timezone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDate(todayStr()), []);

  const needsPlatform = action === 'SHIP' || action === 'RETURN';
  const selectedStock = products.find((p) => p.sku === sku)?.inStock ?? 0;
  const trackingLen = (normalizeTracking(tracking) ?? '').length;
  const trackingTooLong = trackingLen > MAX_TRACKING_LEN;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Returns come back with a courier label — ask for it (scannable) instead of
    // the plain confirm box, so the tracking number is captured at the same time.
    if (action === 'RETURN') {
      setTracking('');
      setCondition('GOOD');
      setMyntraActive(null); // a manually-picked return shouldn't show a stale scan's photo/reason
      setScanOpen(true);
      return;
    }

    const actionLabel = ACTIONS.find((a) => a.key === action)?.label ?? action;
    const productName = products.find((p) => p.sku === sku)?.name;
    const ok = await ask({
      title: `Confirm ${actionLabel}`,
      details: [
        { label: 'Product', value: productName ? `${sku} — ${productName}` : sku },
        { label: 'Action', value: actionLabel },
        { label: 'Quantity', value: qty || '0' },
        ...(needsPlatform ? [{ label: 'Platform', value: PLATFORM_LABELS[channel] }] : []),
        { label: 'Date', value: date && date !== todayStr() ? date : 'Today' },
      ],
      confirmLabel: actionLabel,
    });
    if (!ok) return;

    await save();
  }

  async function save() {
    if (trackingTooLong) return;
    const actionLabel = ACTIONS.find((a) => a.key === action)?.label ?? action;
    setBusy(true);
    setErr(null);
    try {
      const today = todayStr();
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only send a date when it's a PAST date; for today, omit it so the real
        // time-of-day is kept.
        body: JSON.stringify({
          sku,
          action,
          qty: Number(qty),
          channel: needsPlatform ? channel : undefined,
          date: date && date !== today ? date : undefined,
          trackingId: tracking.trim() || undefined,
          condition: action === 'RETURN' ? condition : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data?.error || `Error ${res.status}`;
        setErr(/insufficient stock|not enough stock/i.test(raw) ? `Not enough stock to ship ${qty}.` : raw);
      } else {
        toast.success(`${actionLabel} saved ✓`);
        setQty(action === 'RETURN' ? '1' : '');
        setTracking('');
        setScanOpen(false);
        if (myntraActive) {
          // Mark this one added rather than clearing the whole list — the
          // other candidates from the same scan (a multi-item shipment)
          // stay right there to add next, no re-scanning needed.
          const justAdded = myntraActive;
          setMyntraCandidates((list) => list.map((c) => (c === justAdded ? { ...c, added: true } : c)));
          setMyntraActive(null);
        }
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Scan a Myntra return tracking id (e.g. MYSR...) and resolve it — replaces
   * manually looking it up on Myntra's own site twice (SPF claim -> original
   * tracking id + photo, then that id -> real SKU + size). A shipment that
   * carried more than one product resolves to more than one candidate here —
   * this always renders as a list below the scan box, never assumes exactly
   * one result. Matches each resolved SKU against this page's own product
   * list by exact string first, then by suffix (brand-prefix drift across
   * marketplace listings is a known, real thing here — see
   * stockSkuFor/addPending) — an item with no match still shows, with its
   * own error and no "Add this" button, instead of the whole scan failing.
   *
   * `idOverride` lets the camera scanner (below) resolve immediately with
   * the just-decoded text, instead of setting state and waiting a render
   * cycle for `myntraScanId` to actually update.
   */
  async function resolveMyntraReturn(idOverride?: string) {
    const id = (idOverride ?? myntraScanId).trim().toUpperCase();
    if (!id) return;
    setMyntraScanId(id);
    setMyntraResolving(true);
    setMyntraResolveError(null);
    setMyntraCandidates([]);
    try {
      const res = await fetch(`/api/resolve-myntra-return?trackingId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        setMyntraResolveError(data?.error || `Error ${res.status}`);
        return;
      }
      const items: Array<{ sku: string; image: string | null; returnReason: string | null; size: string | null; color: string | null }> =
        data.items ?? [];
      const candidates: MyntraCandidate[] = items.map((it) => {
        const match = products.find((p) => p.sku === it.sku) ?? products.find((p) => suffixOf(p.sku) === suffixOf(it.sku));
        return {
          resolvedSku: it.sku,
          matchedSku: match?.sku ?? null,
          productName: match?.name ?? null,
          image: it.image,
          returnReason: it.returnReason,
          size: it.size,
          color: it.color,
          matchError: match ? null : `SKU ${it.sku} isn't in the product catalog here.`,
          added: false,
        };
      });
      setMyntraCandidates(candidates);
    } catch (e) {
      setMyntraResolveError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setMyntraResolving(false);
    }
  }

  /** Loads one resolved candidate into the "scan the label" modal — the
   *  scanned tracking id is reused as-is for whichever item is picked. */
  function selectMyntraCandidate(candidate: MyntraCandidate) {
    if (!candidate.matchedSku) return;
    setSku(candidate.matchedSku);
    setChannel('MYNTRA');
    setQty('1');
    setTracking(myntraScanId.trim().toUpperCase());
    setCondition('GOOD');
    setMyntraActive(candidate);
    setScanOpen(true);
  }

  /** Mobile camera scan — the phone's rear camera reads the tracking barcode
   *  straight off the return label, closes the camera, and resolves it
   *  immediately, same as scanning/typing it into the box by hand. */
  function handleBarcodeDetected(text: string) {
    setCameraOpen(false);
    resolveMyntraReturn(text);
  }

  function closeScan() {
    setScanOpen(false);
    setMyntraActive(null);
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      {lockedAction === 'RETURN' ? (
        <div className="mb-4 rounded-lg border border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <ScanLine size={13} /> Scan a Myntra return tracking ID — auto-fills product, size &amp; photo
          </div>
          <div className="mt-1.5 flex gap-2">
            <input
              value={myntraScanId}
              onChange={(e) => setMyntraScanId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolveMyntraReturn(); } }}
              placeholder="MYSR… / MYER… / MYEC…"
              className={`flex-1 font-mono ${input}`}
            />
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              disabled={myntraResolving}
              title="Scan with camera"
              aria-label="Scan with camera"
              className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              <Camera size={16} />
            </button>
            <button
              type="button"
              onClick={() => resolveMyntraReturn()}
              disabled={myntraResolving || !myntraScanId.trim()}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              {myntraResolving ? 'Looking up…' : 'Resolve'}
            </button>
          </div>
          {myntraResolveError ? <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">{myntraResolveError}</div> : null}

          {myntraCandidates.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-xs text-neutral-500">
                Found {myntraCandidates.length} item{myntraCandidates.length === 1 ? '' : 's'} for this tracking ID
              </div>
              {myntraCandidates.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-neutral-900"
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                      {c.productName ?? c.resolvedSku}
                    </div>
                    <div className="font-mono text-neutral-500">{c.matchedSku ?? c.resolvedSku}</div>
                    {c.size ? (
                      <div className="text-neutral-400">
                        Size: {c.size}
                        {c.color ? ` · ${c.color}` : ''}
                      </div>
                    ) : null}
                    {c.matchError ? <div className="text-red-600 dark:text-red-400">{c.matchError}</div> : null}
                  </div>
                  {c.added ? (
                    <span className="shrink-0 rounded-lg bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      ✓ Added
                    </span>
                  ) : c.matchedSku ? (
                    <button
                      type="button"
                      onClick={() => selectMyntraCandidate(c)}
                      className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Add this
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {err ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          ⚠ {err}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          <span className="flex items-center justify-between">
            <span>Product</span>
            {sku ? (
              <span>In stock: <b className={qtyColor(selectedStock)}>{selectedStock}</b></span>
            ) : null}
          </span>
          <SearchableSelect
            options={products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }))}
            value={sku}
            onChange={setSku}
            placeholder="Search product…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Quantity
          <input className={input} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" required />
        </label>
        <button className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={busy || !qty || !sku}>
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!lockedAction
          ? ACTIONS.map((a) => (
              <button
                type="button"
                key={a.key}
                onClick={() => {
                  setAction(a.key);
                  if (a.key === 'RETURN' && !qty) setQty('1');
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  action === a.key ? `${a.tone} text-white shadow-sm` : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
                }`}
                title={a.help}
              >
                <a.Icon size={15} />
                {a.label}
              </button>
            ))
          : null}

        {needsPlatform ? (
          <div className="ml-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-neutral-500">Platform</span>
            {PLATFORMS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setChannel(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  channel === p
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        ) : !lockedAction ? (
          <span className="self-center text-xs text-neutral-400">{ACTIONS.find((a) => a.key === action)?.help}</span>
        ) : null}

        <label className="ml-1 flex items-center gap-2 text-xs text-neutral-500">
          Date
          <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
        <ProductPicker products={products} value={sku} onChange={setSku} />
      </div>

      {scanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeScan}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Return — scan the label</h3>

            <div className="mt-3 rounded-lg bg-black/5 p-3 dark:bg-white/5">
              <div className="font-medium">{products.find((p) => p.sku === sku)?.name ?? sku}</div>
              <div className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">{sku}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {PLATFORM_LABELS[channel]} · {qty || 0} unit{Number(qty) === 1 ? '' : 's'} · {date && date !== todayStr() ? date : 'today'}
              </div>
            </div>

            {myntraActive ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-black/10 p-2 dark:border-white/10">
                {myntraActive.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={myntraActive.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                ) : null}
                <div className="min-w-0 text-xs text-neutral-500">
                  <div className="font-medium text-neutral-600 dark:text-neutral-300">Resolved from Myntra SPF</div>
                  {myntraActive.size ? (
                    <div>
                      Size: <b className="text-neutral-700 dark:text-neutral-200">{myntraActive.size}</b>
                      {myntraActive.color ? ` · ${myntraActive.color}` : ''}
                    </div>
                  ) : null}
                  {myntraActive.returnReason ? <div className="truncate">Reason: {myntraActive.returnReason}</div> : null}
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <div className="text-xs text-neutral-500">What came back?</div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {RETURN_CONDITIONS.map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setCondition(k)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      condition === k
                        ? k === 'GOOD' ? 'bg-emerald-600 text-white' : k === 'USED' ? 'bg-amber-600 text-white' : k === 'FAKED' ? 'bg-purple-600 text-white' : 'bg-red-600 text-white'
                        : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {RETURN_CONDITION_LABELS[k]}
                    <span className={`ml-auto text-xs font-normal ${condition === k ? 'opacity-80' : 'text-neutral-400'}`}>
                      {RETURN_CONDITION_HINTS[k]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 flex flex-col gap-1 text-xs text-neutral-500">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5"><ScanLine size={13} /> Tracking / AWB <span className="text-neutral-400">(optional)</span></span>
                {trackingLen > 0 ? <span className={trackingTooLong ? 'text-red-500' : 'text-neutral-400'}>{trackingLen}/{MAX_TRACKING_LEN}</span> : null}
              </span>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                autoFocus
                placeholder="Scan or type the number…"
                className={`rounded-lg border bg-transparent px-3 py-2.5 font-mono text-sm text-neutral-900 dark:text-white ${
                  trackingTooLong ? 'border-red-500' : 'border-black/15 dark:border-white/20'
                }`}
              />
              {trackingTooLong ? (
                <span className="text-red-500">Too long — at most {MAX_TRACKING_LEN} characters. Scan again.</span>
              ) : null}
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeScan} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy || trackingTooLong} className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                condition === 'GOOD' ? 'bg-emerald-600 hover:bg-emerald-700' : condition === 'USED' ? 'bg-amber-600 hover:bg-amber-700' : condition === 'FAKED' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'
              }`}>
                {busy ? 'Saving…' : 'Save return'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cameraOpen ? <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setCameraOpen(false)} /> : null}
    </form>
  );
}
