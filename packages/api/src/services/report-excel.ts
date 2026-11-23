import ExcelJS from 'exceljs';

/** A simple, accountant-friendly workbook: one sheet per table, frozen header, totals row, ₹ formats. */
export type ColType = 'text' | 'money' | 'int' | 'date' | 'pct' | 'num';
export interface Col { header: string; key: string; type?: ColType; width?: number }
export interface SheetSpec { name: string; title?: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> }

const NAVY = 'FF1B3A5C';
const AQUA = 'FFEEF8F7';
const FMT: Record<ColType, string | undefined> = { text: undefined, money: '#,##,##0.00;[Red]-#,##,##0.00', int: '#,##0', date: 'dd-mm-yyyy', pct: '0.0"%"', num: '0.00' };

export async function buildReportWorkbook(title: string, sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kush Enterprise';
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 2 }] });
    ws.getCell('A1').value = sh.title ?? `${title}: ${sh.name}`;
    ws.getCell('A1').font = { bold: true, size: 12, color: { argb: NAVY } };
    ws.columns = sh.columns.map((c) => ({ key: c.key, width: c.width ?? (c.type === 'text' || !c.type ? 24 : 14), style: FMT[c.type ?? 'text'] ? { numFmt: FMT[c.type ?? 'text'] } : {} }));
    const head = ws.getRow(2);
    sh.columns.forEach((c, i) => { const cell = head.getCell(i + 1); cell.value = c.header; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
    head.height = 30;
    const conv = (c: Col, v: unknown) => (c.type === 'date' && typeof v === 'string' && v ? new Date(`${v}T00:00:00.000Z`) : v ?? null);
    for (const r of sh.rows) ws.addRow(Object.fromEntries(sh.columns.map((c) => [c.key, conv(c, r[c.key])])));
    if (sh.totals) {
      const row = ws.addRow(Object.fromEntries(sh.columns.map((c) => [c.key, sh.totals![c.key] ?? null])));
      row.font = { bold: true };
      row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AQUA } }; });
    }
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: sh.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
