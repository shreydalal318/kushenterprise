import ExcelJS from 'exceljs';

/**
 * Price sheets for the accountant/owner: export → edit in Excel → import with a preview.
 * The sheet is the full truth for the rows it contains: a blank special price removes it.
 */

export type SheetMode = 'customer' | 'list';

export interface PriceSheetRow {
  code: string;
  name: string;
  category: string;
  brand: string | null;
  unit: string;
  mrp: number;
  defaultRate: number;
  listRate?: number | null; // customer mode: the customer's price-list rate (read-only)
  rate: number | null; // customer mode: special price; list mode: list rate
  validFrom: string | null;
  validTo: string | null;
  note?: string | null;
}

const NAVY = 'FF1B3A5C';
const AQUA = 'FFEEF8F7';
const HEADERS: Record<SheetMode, string[]> = {
  customer: ['Code', 'Product', 'Category', 'Brand', 'Unit', 'MRP', 'Default rate', 'Price list rate', 'Special price', 'Valid from', 'Valid to', 'Note'],
  list: ['Code', 'Product', 'Category', 'Brand', 'Unit', 'MRP', 'Default rate', 'List rate', 'Valid from', 'Valid to'],
};
const EDITABLE: Record<SheetMode, string[]> = {
  customer: ['Special price', 'Valid from', 'Valid to', 'Note'],
  list: ['List rate', 'Valid from', 'Valid to'],
};
const dateCell = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export async function buildPriceWorkbook(opts: { mode: SheetMode; title: string; rows: PriceSheetRow[] }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kush Enterprise';
  wb.created = new Date();
  const ws = wb.addWorksheet('Prices', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  const headers = HEADERS[opts.mode];
  ws.addRow(headers);
  for (const r of opts.rows) {
    ws.addRow(opts.mode === 'customer'
      ? [r.code, r.name, r.category, r.brand ?? '', r.unit, r.mrp, r.defaultRate, r.listRate ?? null, r.rate, dateCell(r.validFrom), dateCell(r.validTo), r.note ?? '']
      : [r.code, r.name, r.category, r.brand ?? '', r.unit, r.mrp, r.defaultRate, r.rate, dateCell(r.validFrom), dateCell(r.validTo)]);
  }
  const widths: Record<string, number> = { Code: 22, Product: 48, Category: 18, Brand: 16, Unit: 8, Note: 30 };
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = widths[h] ?? 14;
    if (['MRP', 'Default rate', 'Price list rate', 'Special price', 'List rate'].includes(h)) col.numFmt = '#,##,##0.00';
    if (h.startsWith('Valid')) col.numFmt = 'dd-mm-yyyy';
    if (EDITABLE[opts.mode].includes(h)) {
      col.eachCell({ includeEmpty: true }, (c, row) => { if (row > 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AQUA } }; });
    }
  });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const help = wb.addWorksheet('How to use');
  [
    [opts.title],
    [],
    [`Edit only the shaded columns: ${EDITABLE[opts.mode].join(', ')}.`],
    [opts.mode === 'customer' ? 'Leave "Special price" blank to remove a special price (the customer then pays the price-list or default rate).' : 'Leave "List rate" blank to remove the product from this price list.'],
    ['Dates are optional (DD-MM-YYYY). Outside the dates the special price is ignored.'],
    ['Rates cannot be above MRP. Do not change the Code column; rows you delete are left unchanged.'],
    ['Import the file back on the same screen; you will see every change before it is saved.'],
  ].forEach((r) => help.addRow(r));
  help.getRow(1).font = { bold: true, size: 13, color: { argb: NAVY } };
  help.getColumn(1).width = 110;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ParsedPriceRow {
  rowNo: number;
  code: string;
  rate: number | null;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
  }
  return String(v).trim();
}

function parseRate(v: ExcelJS.CellValue): number | null | 'invalid' {
  const t = cellText(v).replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 'invalid';
}

function parseDate(v: ExcelJS.CellValue): string | null | 'invalid' {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); // Excel serial
  const t = cellText(v);
  if (!t) return null;
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t); // DD-MM-YYYY
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  return 'invalid';
}

export async function parsePriceWorkbook(buf: Buffer, mode: SheetMode): Promise<{ rows: ParsedPriceRow[]; errors: { rowNo: number; message: string }[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { rows: [], errors: [{ rowNo: 0, message: 'This is not a readable .xlsx file' }] };
  }
  const ws = wb.getWorksheet('Prices') ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: [{ rowNo: 0, message: 'The workbook has no sheets' }] };

  // Locate the header row and columns by name, so re-ordered or extra columns still work.
  let headerRow = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const vals = (ws.getRow(r).values as ExcelJS.CellValue[]).map((v) => cellText(v).toLowerCase());
    if (vals.includes('code')) {
      headerRow = r;
      vals.forEach((v, i) => { if (v) col[v] = i; });
      break;
    }
  }
  const rateHeader = mode === 'customer' ? 'special price' : 'list rate';
  if (!headerRow || !col.code || !col[rateHeader]) {
    return { rows: [], errors: [{ rowNo: 0, message: `Header row must include "Code" and "${mode === 'customer' ? 'Special price' : 'List rate'}"` }] };
  }

  const rows: ParsedPriceRow[] = [];
  const errors: { rowNo: number; message: string }[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = cellText(row.getCell(col.code!).value).toUpperCase();
    if (!code) continue;
    const rate = parseRate(row.getCell(col[rateHeader]!).value);
    const validFrom = col['valid from'] ? parseDate(row.getCell(col['valid from']).value) : null;
    const validTo = col['valid to'] ? parseDate(row.getCell(col['valid to']).value) : null;
    const note = col.note ? cellText(row.getCell(col.note).value) || null : null;
    if (rate === 'invalid') { errors.push({ rowNo: r, message: `${code}: rate must be a positive number` }); continue; }
    if (validFrom === 'invalid' || validTo === 'invalid') { errors.push({ rowNo: r, message: `${code}: dates must be DD-MM-YYYY` }); continue; }
    if (validFrom && validTo && validFrom > validTo) { errors.push({ rowNo: r, message: `${code}: "Valid from" is after "Valid to"` }); continue; }
    rows.push({ rowNo: r, code, rate, validFrom, validTo, note: note ? note.slice(0, 200) : null });
  }
  return { rows, errors };
}
