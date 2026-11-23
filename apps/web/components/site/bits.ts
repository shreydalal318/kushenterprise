export const LENS_TYPE_LABEL: Record<string, string> = { MONOFOCAL: 'Monofocal', TORIC: 'Toric', MULTIFOCAL: 'Multifocal', EDOF: 'Extended depth of focus' };
export const fmtPower = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(2)}`;
