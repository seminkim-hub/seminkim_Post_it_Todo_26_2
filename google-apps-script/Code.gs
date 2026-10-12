const SPREADSHEET_ID = "1Ln8WFiX6KeE1zr0boOgHE5HTWN_PSssNzt1SXcBweX0";
const REQUIRED_HEADERS = ["timestamp", "datetime", "category", "content", "color", "state", "order"];

/** GET 요청: 시트에 저장된 포스트잇 목록을 가져옵니다. */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "list";
    if (action !== "list") return json_({ ok: false, error: "지원하지 않는 요청입니다." });
    return json_({ ok: true, notes: listNotes_() });
  } catch (error) {
    return json_({ ok: false, error: error.message || "시트에서 메모를 불러오지 못했습니다." });
  }
}

/** POST 요청: 생성, 수정, 삭제, 순서 변경을 처리합니다. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const sheet = getSheet_();
    const columns = getColumns_(sheet);
    let result;

    switch (body.action) {
      case "create":
        result = createNote_(sheet, columns, body.note || {});
        break;
      case "update":
        result = updateNote_(sheet, columns, body.id, body.note || {});
        break;
      case "delete":
        result = deleteNote_(sheet, columns, body.id);
        break;
      case "reorder":
        result = reorderNotes_(sheet, columns, body.items || []);
        break;
      default:
        throw new Error("지원하지 않는 메모 작업입니다.");
    }
    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({ ok: false, error: error.message || "Google 시트 작업에 실패했습니다." });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheets()[0];
  if (!sheet) throw new Error("스프레드시트에 사용할 시트 탭이 없습니다.");
  return sheet;
}

function getColumns_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    return Object.fromEntries(REQUIRED_HEADERS.map((header, index) => [header, index + 1]));
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map((header) => String(header).trim().toLowerCase());
  const columns = {};
  headers.forEach((header, index) => { if (header) columns[header] = index + 1; });
  const missing = REQUIRED_HEADERS.filter((header) => !columns[header]);
  if (missing.length) throw new Error("첫 행에 필요한 열 제목이 없습니다: " + missing.join(", "));
  return columns;
}

function listNotes_() {
  const sheet = getSheet_();
  const columns = getColumns_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows.filter((row) => row[columns.timestamp - 1] !== "").map((row) => noteFromRow_(row, columns))
    .sort((left, right) => left.order - right.order || left.timestamp.localeCompare(right.timestamp));
}

function noteFromRow_(row, columns) {
  const timestamp = dateString_(row[columns.timestamp - 1]);
  return {
    id: timestamp,
    timestamp: timestamp,
    datetime: dateString_(row[columns.datetime - 1]),
    category: String(row[columns.category - 1] || "기타"),
    content: String(row[columns.content - 1] || ""),
    color: String(row[columns.color - 1] || "yellow"),
    state: String(row[columns.state - 1] || "진행 중"),
    order: Number(row[columns.order - 1]) || 0,
  };
}

function createNote_(sheet, columns, input) {
  const content = String(input.content || "").trim();
  if (!content) throw new Error("메모 내용을 입력해 주세요.");
  const existing = listNotes_();
  let timestamp = new Date().toISOString();
  while (existing.some((note) => note.timestamp === timestamp)) timestamp = new Date(Date.parse(timestamp) + 1).toISOString();
  const note = {
    id: timestamp,
    timestamp: timestamp,
    datetime: input.datetime ? new Date(input.datetime).toISOString() : timestamp,
    category: cleanCategory_(input.category),
    content: content,
    color: cleanColor_(input.color),
    state: cleanState_(input.state),
    order: 0,
  };
  existing.forEach((item) => setCellById_(sheet, columns, item.id, "order", item.order + 1));
  appendNote_(sheet, columns, note);
  return { note: note };
}

function updateNote_(sheet, columns, id, input) {
  const rowNumber = findRow_(sheet, columns, id);
  if (!rowNumber) throw new Error("수정할 메모를 찾지 못했습니다. 목록을 새로고침해 주세요.");
  const current = noteFromRow_(sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0], columns);
  const note = {
    ...current,
    category: cleanCategory_(input.category === undefined ? current.category : input.category),
    content: input.content === undefined ? current.content : String(input.content).trim(),
    color: cleanColor_(input.color === undefined ? current.color : input.color),
    state: cleanState_(input.state === undefined ? current.state : input.state),
    order: input.order === undefined ? current.order : Math.max(0, Number(input.order) || 0),
  };
  if (!note.content) throw new Error("메모 내용을 입력해 주세요.");
  ["category", "content", "color", "state", "order"].forEach((field) => sheet.getRange(rowNumber, columns[field]).setValue(note[field]));
  return { note: note };
}

function deleteNote_(sheet, columns, id) {
  const rowNumber = findRow_(sheet, columns, id);
  if (!rowNumber) throw new Error("삭제할 메모를 찾지 못했습니다. 목록을 새로고침해 주세요.");
  sheet.deleteRow(rowNumber);
  return { deleted: true };
}

function reorderNotes_(sheet, columns, items) {
  if (!Array.isArray(items)) throw new Error("메모 순서 정보가 올바르지 않습니다.");
  items.forEach((item) => {
    const rowNumber = findRow_(sheet, columns, item.id);
    if (rowNumber) sheet.getRange(rowNumber, columns.order).setValue(Math.max(0, Number(item.order) || 0));
  });
  return { reordered: true };
}

function appendNote_(sheet, columns, note) {
  const row = Array(sheet.getLastColumn()).fill("");
  REQUIRED_HEADERS.forEach((header) => { row[columns[header] - 1] = note[header]; });
  sheet.appendRow(row);
}

function findRow_(sheet, columns, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, columns.timestamp, sheet.getLastRow() - 1, 1).getValues();
  const index = values.findIndex((row) => dateString_(row[0]) === String(id));
  return index < 0 ? 0 : index + 2;
}

function setCellById_(sheet, columns, id, field, value) {
  const rowNumber = findRow_(sheet, columns, id);
  if (rowNumber) sheet.getRange(rowNumber, columns[field]).setValue(value);
}

function cleanCategory_(value) {
  const category = String(value || "기타");
  if (!["할 일", "아이디어", "기타"].includes(category)) throw new Error("메모 범주가 올바르지 않습니다.");
  return category;
}

function cleanColor_(value) {
  const color = String(value || "yellow");
  if (!["yellow", "pink", "green", "blue"].includes(color)) throw new Error("메모 색상이 올바르지 않습니다.");
  return color;
}

function cleanState_(value) {
  return ["완료", "체크", "진행 중"].includes(String(value)) ? String(value) : "진행 중";
}

function dateString_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
