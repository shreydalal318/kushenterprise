/** Lens power helpers. Powers are dioptres with 2 decimals (e.g. +21.50, -2.00). */

export const LENS_TYPES = ['MONOFOCAL', 'TORIC', 'MULTIFOCAL', 'EDOF'] as const;
export type LensType = (typeof LENS_TYPES)[number];
export const LENS_TYPE_LABELS: Record<LensType, string> = {
  MONOFOCAL: 'Monofocal',
  TORIC: 'Toric',
  MULTIFOCAL: 'Multifocal',
  EDOF: 'EDOF',
};

/** 21.5 -> "+21.50 D", -2 -> "-2.00 D", 0 -> "0.00 D" */
export const formatPower = (p: number, unit = true): string =>
  `${p > 0 ? '+' : p < 0 ? '-' : ''}${Math.abs(p).toFixed(2)}${unit ? ' D' : ''}`;

/** Human label for a variant: "+20.50 D / Cyl +2.25 D (Add +3.50 D)". */
export function variantLabel(v: { powerSph?: number | null; cylinder?: number | null; addPower?: number | null }): string {
  const parts: string[] = [];
  if (v.powerSph != null) parts.push(formatPower(v.powerSph));
  if (v.cylinder != null) parts.push(`Cyl ${formatPower(v.cylinder)}`);
  let s = parts.join(' / ');
  if (v.addPower != null) s += `${s ? ' ' : ''}(Add ${formatPower(v.addPower)})`;
  return s;
}

/** SKU suffix for a power combo: base "LV-HA600", +21.5 -> "LV-HA600-+21.50"; toric adds "-C2.25". */
export function variantSku(base: string, v: { powerSph?: number | null; cylinder?: number | null; addPower?: number | null }): string {
  let s = base;
  if (v.powerSph != null) s += `-${formatPower(v.powerSph, false)}`;
  if (v.cylinder != null) s += `-C${Math.abs(v.cylinder).toFixed(2)}`;
  if (v.addPower != null) s += `-A${Math.abs(v.addPower).toFixed(2)}`;
  return s;
}

export interface PowerRangeInput {
  from: number;
  to: number;
  step: number; // 0.25 | 0.5 | 1
  cylinders?: number[]; // toric: one variant per (power × cylinder)
  addPowers?: number[]; // multifocal: one variant per (power × add)
}

export const MAX_GENERATED_VARIANTS = 600;

/** Expand a power range into variant power combos (exact 0.01 arithmetic, no float drift). */
export function expandPowerRange(r: PowerRangeInput): { powerSph: number; cylinder: number | null; addPower: number | null }[] {
  const c = (n: number) => Math.round(n * 100);
  const [from, to, step] = [c(r.from), c(r.to), c(r.step)];
  if (step <= 0) throw new RangeError('Step must be positive');
  if (to < from) throw new RangeError('"To" power must be greater than or equal to "From"');
  if (Math.abs(r.from) > 60 || Math.abs(r.to) > 60) throw new RangeError('Powers must be between -60 D and +60 D');
  const sph: number[] = [];
  for (let p = from; p <= to; p += step) sph.push(p / 100);
  const cyls = r.cylinders?.length ? r.cylinders : [null];
  const adds = r.addPowers?.length ? r.addPowers : [null];
  const out = sph.flatMap((powerSph) => cyls.flatMap((cylinder) => adds.map((addPower) => ({ powerSph, cylinder, addPower }))));
  if (out.length > MAX_GENERATED_VARIANTS) throw new RangeError(`That would create ${out.length} variants; the limit is ${MAX_GENERATED_VARIANTS} at once`);
  return out;
}
