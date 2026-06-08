import * as XLSX from 'xlsx';
import { toast } from './ui';

/* Ported from artisansmarket-admin exportTableToCSV — scrapes the visible
   table, skips action/image columns, downloads a real .xlsx, toasts success. */
export function exportPageTable(filename: string) {
  const table =
    (document.querySelector('.page-content.active table') as HTMLTableElement | null) ||
    (document.querySelector('.page-content table') as HTMLTableElement | null);
  if (!table) {
    toast('No table found to export.', 'error');
    return;
  }
  const data: string[][] = [];
  table.querySelectorAll('tr').forEach((row) => {
    const cols = row.querySelectorAll('th, td');
    const rowData: string[] = [];
    cols.forEach((col) => {
      if (col.querySelector('.btn-action') || col.querySelector('.btn-export')) return;
      const text = (col.textContent || '').trim();
      if (!text && col.querySelector('img')) {
        rowData.push('');
        return;
      }
      rowData.push(text);
    });
    if (rowData.length > 0) data.push(rowData);
  });
  if (data.length <= 1) {
    toast('No data to export.', 'warning');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = data[0].map((_, c) => {
    let maxLen = 10;
    data.forEach((row) => {
      if (row[c] && row[c].length > maxLen) maxLen = row[c].length;
    });
    return { wch: Math.min(maxLen + 2, 40) };
  });
  const sheetName = filename.charAt(0).toUpperCase() + filename.slice(1);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, filename + '_' + dateStr + '.xlsx');
  toast('Exported ' + filename + '.xlsx successfully!', 'success');
}

/* Export an .xlsx straight from a data array (for card-based views like Ratings). */
export function exportDataXlsx(filename: string, header: string[], rows: (string | number)[][]) {
  if (rows.length === 0) {
    toast('Nothing to export yet.', 'warning');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, filename.charAt(0).toUpperCase() + filename.slice(1));
  XLSX.writeFile(wb, filename + '_' + new Date().toISOString().split('T')[0] + '.xlsx');
  toast('Exported ' + filename + '.xlsx successfully!', 'success');
}
