/**
 * FULL. スプレッドシート同期
 * このスプレッドシートの「拡張機能」→「Apps Script」に貼り付けて使用します。
 */

const SHEETS = {
  food: {
    name: '食事ログ',
    headers: ['記録ID', '記録日時', '日付', '入力内容', '食べたもの', '満腹ポイント', '食べた感', '端末ID'],
  },
  exercise: {
    name: '運動ログ',
    headers: ['記録ID', '記録日時', '日付', 'コース', '周数', '端末ID'],
  },
};

function doGet() {
  return json_({ ok: true, app: 'FULL.' });
}

function doPost(e) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!SHEETS[payload.kind] || !payload.record || !payload.record.id) {
      return json_({ ok: false, error: 'invalid payload' });
    }

    const config = SHEETS[payload.kind];
    const sheet = getSheet_(config);
    const row = findRow_(sheet, payload.record.id);

    if (payload.action === 'delete') {
      if (row > 1) sheet.deleteRow(row);
      return json_({ ok: true, action: 'delete' });
    }

    const values = payload.kind === 'food'
      ? foodRow_(payload)
      : exerciseRow_(payload);

    if (row > 1) {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    return json_({ ok: true, action: row > 1 ? 'update' : 'append' });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(config) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(config.name);
  if (!sheet) sheet = spreadsheet.insertSheet(config.name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : -1;
}

function foodRow_(payload) {
  const record = payload.record;
  return [
    record.id,
    new Date(record.createdAt),
    record.day,
    record.raw,
    Array.isArray(record.foods) ? record.foods.join('、') : '',
    Number(record.score) || 0,
    record.label || '',
    payload.deviceId || '',
  ];
}

function exerciseRow_(payload) {
  const record = payload.record;
  return [
    record.id,
    new Date(record.createdAt),
    record.day,
    record.course || '',
    Number(record.laps) || 0,
    payload.deviceId || '',
  ];
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
