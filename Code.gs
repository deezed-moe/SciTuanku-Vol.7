const MONTHS_MS = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
];

const HEADERS = [
  'Created At', 'Warden', 'Date', 'Time', 'Place', 'Notes',
  'Drive File ID', 'Drive Link', 'Drive Folder ID'
];

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expectedToken = props.getProperty('SHARED_TOKEN');
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!expectedToken || payload.token !== expectedToken) {
      return json({ ok: false, error: 'Unauthorized request.' });
    }

    if (payload.action === 'upload') return uploadPdf(payload, props);
    if (payload.action === 'list') return listRecords(props);
    if (payload.action === 'download') return downloadPdf(payload);

    return json({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function uploadPdf(payload, props) {
  const warden = String(payload.warden || '').trim();
  const date = String(payload.date || '').trim();
  const time = String(payload.time || '').trim();
  const place = String(payload.place || '').trim();
  const notes = String(payload.notes || '').trim();
  const pdfBase64 = String(payload.pdfBase64 || '');

  if (!warden || warden.length > 120 || !isValidDate(date)) {
    return json({ ok: false, error: 'Invalid OPR details.' });
  }
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return json({ ok: false, error: 'Invalid time.' });
  }
  if (place.length > 120 || notes.length > 1800) {
    return json({ ok: false, error: 'Place or notes are too long.' });
  }
  if (!pdfBase64.startsWith('JVBERi0') || pdfBase64.length > 6000000) {
    return json({ ok: false, error: 'Invalid or oversized PDF.' });
  }

  const rootFolderId = props.getProperty('ROOT_FOLDER_ID');
  if (!rootFolderId) {
    return json({ ok: false, error: 'ROOT_FOLDER_ID is not configured.' });
  }

  // Prepare the Sheet before creating the Drive file.
  const sheet = getRecordsSheet(props);

  const [year, month] = date.split('-');
  const monthFolderName = year + ' - ' + MONTHS_MS[Number(month) - 1];
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const monthFolder = findOrCreateFolder(rootFolder, monthFolderName);

  const safeWarden = warden.normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'Warden';
  const filename = 'OPR-Warden-' + date + '-' + safeWarden + '.pdf';
  const bytes = Utilities.base64Decode(pdfBase64);
  const pdfBlob = Utilities.newBlob(bytes, 'application/pdf', filename);
  const file = monthFolder.createFile(pdfBlob);

  const row = [
    new Date(), warden, date, time, place, notes,
    file.getId(), file.getUrl(), monthFolder.getId()
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return json({
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    driveLink: file.getUrl(),
    folderId: monthFolder.getId(),
    monthFolder: monthFolderName
  });
}

function listRecords(props) {
  const sheet = getRecordsSheet(props);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: true, records: [] });

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const records = rows
    .filter(row => row[6])
    .map(row => ({
      id: String(row[6]),
      nama_warden: String(row[1] || ''),
      tarikh: dateForArchive(row[2]),
      masa: timeForArchive(row[3]),
      tempat: String(row[4] || ''),
      catatan: String(row[5] || ''),
      driveLink: String(row[7] || '')
    }))
    .sort((a, b) => b.tarikh.localeCompare(a.tarikh));

  return json({ ok: true, records: records.slice(0, 1000) });
}

function downloadPdf(payload) {
  const fileId = String(payload.fileId || '');
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return json({ ok: false, error: 'Invalid Drive file ID.' });
  }

  const file = DriveApp.getFileById(fileId);
  if (file.getMimeType() !== MimeType.PDF) {
    return json({ ok: false, error: 'The Drive file is not a PDF.' });
  }

  const bytes = file.getBlob().getBytes();
  if (bytes.length > 4400000) {
    return json({ ok: false, error: 'The PDF exceeds the allowed size.' });
  }

  return json({ ok: true, pdfBase64: Utilities.base64Encode(bytes) });
}

function getRecordsSheet(props) {
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not configured.');

  const sheetName = props.getProperty('SHEET_NAME') || 'OPR Records';
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    const existingHeaders = sheet
      .getRange(1, 1, 1, HEADERS.length)
      .getDisplayValues()[0]
      .map(value => value.trim());
    if (HEADERS.some((header, index) => existingHeaders[index] !== header)) {
      throw new Error('The first row of the OPR Records tab must contain the expected column headers.');
    }
  }

  return sheet;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day;
}

function dateForArchive(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  }
  return String(value || '');
}

function timeForArchive(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Kuala_Lumpur', 'HH:mm');
  }
  return String(value || '');
}

function findOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
