'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { compareSize } from '@/lib/format';
import type { VariantMeta } from '@/lib/variants';

export interface PickerProduct extends VariantMeta {
  sku: string;
  name: string;
  /** The number shown on each chip — on-hand in the Stock Log, available in Ready to Ship. */
  inStock?: number;
}

interface SizeNode { key: string; label: string; sku: string; stock: number }
interface ColorNode { key: string; label: string; stock: number; sizes: SizeNode[] }
interface GroupNode { key: string; label: string; code: string | null; imageUrl?: string; stock: number; colors: ColorNode[] }

const trim = (s?: string) => (s ?? '').trim();

// Same numbering as the product print sheet (/products/print): the digit
// segment right after the brand prefix, e.g. "RRC-007-CO-K-YL-3XL" -> "007".
function skuCode(sku: string): string | null {
  const seg = sku.split('-')[1];
  return seg && /^\d+$/.test(seg) ? seg : null;
}

/**
 * Build the Product → Colour → Size tree straight from the SKUs, not from the
 * ProductGroup colour/size arrays — those can carry stale or duplicate entries
 * ("Blue-cross" vs "Blue-Cross", a trailing space), and every chip here must
 * map to a SKU that really exists. Colours are keyed case-insensitively so the
 * same colour spelled two ways collapses into one chip.
 */
function buildGroups(products: PickerProduct[]): GroupNode[] {
  type Draft = {
    key: string; label: string; code: string | null; imageUrl?: string; stock: number;
    colors: Map<string, { key: string; label: string; stock: number; sizes: Map<string, SizeNode> }>;
  };
  const drafts = new Map<string, Draft>();

  for (const p of products) {
    const gKey = trim(p.groupCode) || trim(p.category) || 'OTHER';
    let g = drafts.get(gKey);
    if (!g) {
      g = {
        key: gKey,
        label: trim(p.groupName) || trim(p.category) || gKey,
        code: skuCode(p.sku),
        imageUrl: p.imageUrl,
        stock: 0,
        colors: new Map(),
      };
      drafts.set(gKey, g);
    }
    if (!g.imageUrl && p.imageUrl) g.imageUrl = p.imageUrl;

    const colorLabel = trim(p.color);
    const cKey = colorLabel.toLowerCase();
    let c = g.colors.get(cKey);
    if (!c) {
      c = { key: cKey, label: colorLabel || 'No colour', stock: 0, sizes: new Map() };
      g.colors.set(cKey, c);
    }

    const sizeLabel = trim(p.size);
    const sKey = sizeLabel.toUpperCase();
    if (c.sizes.has(sKey)) continue; // duplicate variant — keep the first SKU
    const stock = p.inStock ?? 0;
    c.sizes.set(sKey, { key: sKey, label: sizeLabel || 'One size', sku: p.sku, stock });
    c.stock += stock;
    g.stock += stock;
  }

  return [...drafts.values()]
    .map((g) => ({
      key: g.key,
      label: g.label,
      code: g.code,
      imageUrl: g.imageUrl,
      stock: g.stock,
      colors: [...g.colors.values()]
        .map((c) => ({
          key: c.key,
          label: c.label,
          stock: c.stock,
          sizes: [...c.sizes.values()].sort((a, b) => compareSize(a.label, b.label)),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    // Ascending by SKU code (001, 002, ...), same convention as /products/print —
    // groups with no code (shouldn't normally happen) sort after every coded one.
    .sort((a, b) => {
      if (a.code && b.code) return Number(a.code) - Number(b.code);
      if (a.code) return -1;
      if (b.code) return 1;
      return a.label.localeCompare(b.label);
    });
}

/** A rough dot colour for the swatch — the name next to it is the real answer. */
const SWATCHES: [RegExp, string][] = [
  [/black/i, '#23262c'],
  [/white|ivory|cream/i, '#efeae0'],
  [/gre[ya]/i, '#8b9099'],
  [/navy/i, '#22335c'],
  [/blue/i, '#3070cf'],
  [/maroon/i, '#7d2b2b'],
  [/red/i, '#c53a33'],
  [/green|olive/i, '#3f7d4e'],
  [/pink|rose/i, '#dd6f92'],
  [/yellow|mustard/i, '#dfb03c'],
  [/orange|rust/i, '#d8752f'],
  [/purple|violet/i, '#7a52b3'],
  [/brown|beige|tan/i, '#98764f'],
];

function swatch(name: string): string {
  return SWATCHES.find(([re]) => re.test(name))?.[1] ?? '#9ca3af';
}

const CHIP = 'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition';
const CHIP_ON = 'border-brand-600 bg-brand-600 text-white shadow-sm';
const CHIP_OFF = 'border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10';

function stockTone(n: number, on: boolean) {
  if (on) return 'text-white/75';
  if (n <= 0) return 'text-red-500';
  if (n <= 5) return 'text-amber-500';
  return 'text-emerald-500';
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="w-16 shrink-0 pt-2 text-xs text-neutral-500">{label}</div>
      {hint ? (
        <div className="pt-2 text-xs text-neutral-400">{hint}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      )}
    </div>
  );
}

/**
 * Pick a SKU by drilling down Product → Colour → Size instead of typing into the
 * search box. It doesn't replace the search box — it feeds it: picking a size
 * sets the SKU, and searching a SKU lights up its three chips, because every row
 * is derived from the selected SKU rather than kept in its own state.
 */
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: PickerProduct[];
  value: string;
  onChange: (sku: string) => void;
}) {
  const groups = useMemo(() => buildGroups(products), [products]);
  // sku -> where it sits in the tree, so a typed/searched SKU highlights its chips.
  const place = useMemo(() => {
    const m = new Map<string, { group: string; color: string; size: string }>();
    for (const g of groups) for (const c of g.colors) for (const s of c.sizes) {
      m.set(s.sku, { group: g.key, color: c.key, size: s.key });
    }
    return m;
  }, [groups]);

  // Only consulted when no SKU is selected — every path that clears the SKU sets
  // these first, so the rows stay open on what you were browsing.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openColor, setOpenColor] = useState<string | null>(null);

  const at = value ? place.get(value) : undefined;
  const groupKey = at?.group ?? openGroup;
  const colorKey = at?.color ?? openColor;
  const group = groups.find((g) => g.key === groupKey);
  const color = group?.colors.find((c) => c.key === colorKey);

  function pickGroup(g: GroupNode) {
    setOpenGroup(g.key);
    // One colour (or one variant) in the whole product — skip a pointless click.
    const only = g.colors.length === 1 ? g.colors[0] : null;
    setOpenColor(only?.key ?? null);
    const single = only && only.sizes.length === 1 ? only.sizes[0] : null;
    onChange(single ? single.sku : '');
  }

  function pickColor(c: ColorNode) {
    setOpenGroup(group?.key ?? null);
    setOpenColor(c.key);
    // Switching colour keeps the size you were on, when that variant exists.
    const keep = at?.size ? c.sizes.find((s) => s.key === at.size) : undefined;
    const only = c.sizes.length === 1 ? c.sizes[0] : undefined;
    onChange((keep ?? only)?.sku ?? '');
  }

  function clearAll() {
    setOpenGroup(null);
    setOpenColor(null);
    onChange('');
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-500">Or pick it</span>
        {groupKey ? (
          <button type="button" onClick={clearAll} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
            <X size={12} /> clear
          </button>
        ) : null}
      </div>

      <Row label="Product">
        {groups.map((g) => {
          const on = g.key === groupKey;
          return (
            <button type="button" key={g.key} onClick={() => pickGroup(g)} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
              {g.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.imageUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover object-top" />
              ) : null}
              {g.label}
              {g.code ? (
                <span
                  className={`rounded border px-1.5 py-0.5 text-xs font-bold leading-none ${
                    on ? 'border-white/50 text-white' : 'border-neutral-900/40 text-neutral-900 dark:border-white/40 dark:text-white'
                  }`}
                >
                  {g.code}
                </span>
              ) : null}
              <span className={`text-xs font-normal tabular-nums ${stockTone(g.stock, on)}`}>{g.stock}</span>
            </button>
          );
        })}
      </Row>

      <Row label="Colour" hint={group ? undefined : 'pick a product first'}>
        {group?.colors.map((c) => {
          const on = c.key === colorKey;
          return (
            <button type="button" key={c.key} onClick={() => pickColor(c)} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
              <span className="h-3 w-3 shrink-0 rounded-full border border-black/20 dark:border-white/25" style={{ background: swatch(c.label) }} />
              {c.label}
              <span className={`text-xs font-normal tabular-nums ${stockTone(c.stock, on)}`}>{c.stock}</span>
            </button>
          );
        })}
      </Row>

      <Row label="Size" hint={color ? undefined : 'pick a colour first'}>
        {color?.sizes.map((s) => {
          const on = s.sku === value;
          return (
            <button
              type="button"
              key={s.key}
              onClick={() => onChange(s.sku)}
              title={s.sku}
              className={`min-w-[3.25rem] flex-col gap-0 rounded-lg border px-2.5 py-1 text-sm font-medium transition ${on ? CHIP_ON : CHIP_OFF}`}
            >
              <span>{s.label}</span>
              <span className={`block text-xs font-normal tabular-nums ${stockTone(s.stock, on)}`}>{s.stock}</span>
            </button>
          );
        })}
      </Row>
    </div>
  );
}
