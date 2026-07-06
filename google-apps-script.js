const SHEET_NAME = 'tournaments';
const HEADERS = ['slug', 'title', 'format', 'status', 'payload', 'edit_token_hash', 'created_at', 'updated_at'];

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    const sheet = getSheet();

    if (request.action === 'create') {
      return json(createTournament(sheet, request));
    }

    if (request.action === 'get') {
      return json(getTournament(sheet, request.slug));
    }

    if (request.action === 'update') {
      return json(updateTournament(sheet, request));
    }

    if (request.action === 'delete') {
      return json(deleteTournament(sheet, request));
    }

    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) }, 500);
  }
}

function doGet() {
  return json({ ok: true, service: 'TourneyLab Sheets API' });
}

function createTournament(sheet, request) {
  const slug = uniqueSlug(sheet);
  const now = new Date().toISOString();
  const payload = request.payload || {};
  payload.slug = slug;

  sheet.appendRow([
    slug,
    request.title || 'Untitled tournament',
    request.format || payload.format || 'single-elimination',
    request.status || payload.status || 'active',
    JSON.stringify(payload),
    request.editTokenHash,
    now,
    now,
  ]);

  return { ok: true, slug };
}

function getTournament(sheet, slug) {
  const found = findRow(sheet, slug);
  if (!found) return { ok: false, error: 'Tournament not found.' };

  return {
    ok: true,
    slug: found.row.slug,
    title: found.row.title,
    format: found.row.format,
    status: found.row.status,
    payload: JSON.parse(found.row.payload),
    updated_at: found.row.updated_at,
  };
}

function updateTournament(sheet, request) {
  const found = findRow(sheet, request.slug);
  if (!found) return { ok: false, error: 'Tournament not found.' };

  const incomingHash = sha256(request.editToken || '');
  if (incomingHash !== found.row.edit_token_hash) {
    return { ok: false, error: 'The edit link is not valid for this tournament.' };
  }

  const now = new Date().toISOString();
  const payload = request.payload || {};
  payload.slug = request.slug;
  const values = [
    request.slug,
    payload.title || found.row.title,
    payload.format || found.row.format,
    request.status || payload.status || found.row.status,
    JSON.stringify(payload),
    found.row.edit_token_hash,
    found.row.created_at,
    now,
  ];

  sheet.getRange(found.index, 1, 1, HEADERS.length).setValues([values]);
  return { ok: true };
}

function deleteTournament(sheet, request) {
  const found = findRow(sheet, request.slug);
  if (!found) return { ok: false, error: 'Tournament not found.' };

  const incomingHash = sha256(request.editToken || '');
  if (incomingHash !== found.row.edit_token_hash) {
    return { ok: false, error: 'The edit link is not valid for this tournament.' };
  }

  sheet.deleteRow(found.index);
  return { ok: true };
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const isEmpty = firstRow.every((value) => value === '');
  if (isEmpty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function findRow(sheet, slug) {
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (values[index][0] === slug) {
      const row = {};
      HEADERS.forEach((header, column) => {
        row[header] = values[index][column];
      });
      return { index: index + 1, row };
    }
  }
  return null;
}

function uniqueSlug(sheet) {
  let slug = '';
  do {
    slug = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  } while (findRow(sheet, slug));
  return slug;
}

function sha256(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map((byte) => {
    const normalized = byte < 0 ? byte + 256 : byte;
    return normalized.toString(16).padStart(2, '0');
  }).join('');
}

function json(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
