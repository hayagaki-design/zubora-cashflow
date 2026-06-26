const SHEET_NAME = "cashflow";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const sheet = getSheet();
  const existingIds = getExistingIds(sheet);
  const rows = [];

  (payload.entries || []).forEach((entry) => {
    if (!entry.id || existingIds.has(entry.id)) return;
    rows.push([
      entry.id,
      entry.date || "",
      entry.typeLabel || entry.type || "",
      entry.category || "",
      Number(entry.amount || 0),
      entry.memo || "",
      entry.createdAt || "",
      payload.sentAt || "",
    ]);
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, inserted: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["id", "date", "type", "category", "amount", "memo", "createdAt", "syncedAt"]);
  }

  return sheet;
}

function getExistingIds(sheet) {
  if (sheet.getLastRow() < 2) return new Set();
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return new Set(values.flat().filter(Boolean));
}
