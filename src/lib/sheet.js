// Reading spreadsheets HR uploads or pastes: CSV (comma, semicolon or tab separated, as Excel saves it in different
// regional settings), text pasted from Excel, and .xlsx files. Used by the asset register and candidate import.
import readExcelFile from "read-excel-file/browser";

function delimiterOf(content) {
  const head = content.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join("\n").replace(/"[^"]*"/g, "");
  const counts = [",", ";", "\t"].map((d) => [d, head.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** CSV / pasted text -> rows of cells. */
export function parseCsv(raw) {
  const content = String(raw || "").replace(/^﻿/, ""); // byte-order mark Excel adds to "CSV UTF-8"
  const sep = delimiterOf(content);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Every sheet of an uploaded file: [{ sheet, data: rows of cells }]. */
export async function readSheets(file) {
  if (/\.(csv|txt)$/i.test(file.name)) return [{ sheet: file.name.replace(/\.\w+$/i, ""), data: parseCsv(await file.text()) }];
  return readExcelFile(file);
}

/** Save rows as a CSV the user downloads (formula-like cells are quoted so Excel doesn't run them). */
export function downloadSheet(filename, rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const url = URL.createObjectURL(new Blob([`${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
