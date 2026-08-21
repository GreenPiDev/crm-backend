import * as XLSX from 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseSpreadsheet(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [] };
  }
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const headerSet = new Set<string>();
  for (const row of json) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }
  const headers = [...headerSet];

  const rows = json.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const key of headers) {
      stringRow[key] = String(row[key] ?? '').trim();
    }
    return stringRow;
  });

  return { headers, rows };
}
