import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, symlinkSync } from "node:fs";
import { join, basename } from "node:path";
import ExcelJS from "exceljs";
import { awardsFixture, eventPayload, teamPayload } from "./awards-fixture.mjs";
import { criteriaPdf, criteriaDocx } from "./document-fixtures.mjs";
import { MAX_DOCUMENT_BYTES, sanitizeEventDocuments } from "../shared/event-documents.js";

test("event documents: upload roles, actual bytes, event isolation, updates, new tabs headers and persistence", async (t) => {
  const api = await awardsFixture();
  t.after(() => api.close());
  const upload = (name, bytes, cookie = api.director, extra = {}) => fetch(api.base + "/api/event-documents", {
    method: "POST", headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name), ...extra }, body: bytes,
  });
  const pdf = criteriaPdf(), docx = criteriaDocx();
  assert.equal((await upload("Критерии.pdf", pdf, "")).status, 401);
  assert.equal((await upload("Критерии.pdf", pdf, api.admin, { Origin: "https://another-site.test" })).status, 403);
  const pdfRes = await upload("Критерии математики.pdf", pdf, api.admin);
  assert.equal(pdfRes.status, 201);
  const pdfDoc = await pdfRes.json();
  const wordRes = await upload("Положение олимпиады.docx", docx);
  assert.equal(wordRes.status, 201);
  const wordDoc = await wordRes.json();
  assert.equal(pdfDoc.size, pdf.length);
  assert.equal((await fetch(api.base + pdfDoc.url)).status, 404, "Unpublished draft uploads are not public");
  assert.equal((await fetch(api.base + pdfDoc.url, { headers: { Cookie: api.director } })).status, 200);
  const first = await api.create(eventPayload({ city: "Лондон", documents: [pdfDoc, wordDoc] }));
  const second = await api.create(eventPayload({ city: "Токио" }));
  const firstEvent = (await api.request("/events/" + first)).data;
  assert.deepEqual(firstEvent.documents, [pdfDoc, wordDoc]);
  assert.deepEqual((await api.request("/events/" + second)).data.documents, []);
  for (const [doc, bytes, disposition, mime] of [
    [pdfDoc, pdf, "inline", "application/pdf"], [wordDoc, docx, "attachment", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]) {
    const res = await fetch(api.base + doc.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), mime);
    assert.match(res.headers.get("content-disposition"), new RegExp("^" + disposition));
    assert.ok(res.headers.get("content-disposition").includes(encodeURIComponent(doc.name)));
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
    assert.equal((await fetch(api.base + doc.url, { method: "HEAD" })).headers.get("content-length"), String(bytes.length));
    const range = await fetch(api.base + doc.url, { headers: { Range: "bytes=0-9" } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 10));
  }
  const registered = await api.request("/registrations", { method: "POST", body: teamPayload(first) });
  assert.equal(registered.res.status, 201);
  assert.deepEqual(registered.data.documents, [pdfDoc, wordDoc]);
  assert.deepEqual((await api.request("/registrations", { method: "POST", body: teamPayload(second) })).data.documents, []);
  // Old clients that omit the new field retain attachments during ordinary edits.
  assert.equal((await api.request("/events/" + first, { cookie: api.director, method: "PUT", body: eventPayload({ city: "Лондон" }) })).res.status, 200);
  assert.deepEqual((await api.request("/events/" + first)).data.documents, [pdfDoc, wordDoc]);
  const edit = (documents, overrides = {}) => api.request("/events/" + first, { cookie: api.director, method: "PUT", body: eventPayload({ city: "Лондон", documents, ...overrides }) });
  assert.equal((await edit([pdfDoc], { active: false })).res.status, 200);
  assert.equal((await fetch(api.base + pdfDoc.url)).status, 404, "Hidden-event files are private");
  assert.equal((await edit([pdfDoc])).res.status, 200);
  assert.equal((await fetch(api.base + wordDoc.url)).status, 404, "Removing a document detaches its public URL");
  const state = (await api.request("/events/" + first)).data;
  await api.stop(); await api.start();
  assert.deepEqual((await api.request("/events/" + first)).data, state);
  assert.deepEqual(Buffer.from(await (await fetch(api.base + pdfDoc.url)).arrayBuffer()), pdf);
  assert.equal((await edit([])).res.status, 200);
  assert.equal((await fetch(api.base + pdfDoc.url)).status, 404);
});

test("document validation rejects unsafe URLs, spoofed files, duplicate references and oversize uploads; other formats retain bytes", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const upload = (name, bytes) => fetch(api.base + "/api/event-documents", {
    method: "POST", headers: { Cookie: api.director, "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name) }, body: bytes,
  });
  for (const [name, bytes, status] of [
    ["fake.pdf", Buffer.from("<script>alert(1)</script>"), 400],
    ["fake.docx", criteriaPdf(), 400], ["empty.pdf", Buffer.alloc(0), 400],
    ["bad.html", Buffer.from("<html>test</html>"), 415],
    ["test.txt", Buffer.from([0xff, 0xfe, 0]), 400],
    ["too-big.txt", Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65), 413],
  ]) assert.equal((await upload(name, bytes)).status, status, name);
  const book = new ExcelJS.Workbook(); book.addWorksheet("Criteria").addRow(["Test criteria", 100]);
  const xlsx = Buffer.from(await book.xlsx.writeBuffer());
  assert.equal((await upload("fake.docx", xlsx)).status, 400, "Spreadsheet ZIP cannot be disguised as Word");
  const docRes = await upload("Criteria.pdf", criteriaPdf()); assert.equal(docRes.status, 201);
  const doc = await docRes.json();
  const id = await api.create();
  const edit = (documents) => api.request("/events/" + id, { cookie: api.admin, method: "PUT", body: eventPayload({ documents }) });
  for (const documents of [
    [{ ...doc, url: "https://evil.test/file.pdf" }], [{ ...doc, url: "javascript:alert(1)" }],
    [{ ...doc, url: "/api/event-documents/../iqland.sqlite" }],
    [{ ...doc, url: "/api/event-documents/00000000-0000-4000-8000-000000000000.pdf" }],
    [{ ...doc, name: "bad\r\nname.pdf" }], [doc, doc], Array(11).fill(doc),
  ]) assert.equal((await edit(documents)).res.status, 400);
  assert.deepEqual((await api.request("/events/" + id)).data.documents, []);
  // Byte size is server-derived, never trusted from JSON metadata.
  assert.equal((await edit([{ ...doc, size: 1 }])).res.status, 200);
  assert.equal((await api.request("/events/" + id)).data.documents[0].size, criteriaPdf().length);
  const dir = join(api.dir, "documents");
  const symlink = "00000000-0000-4000-8000-000000000001.pdf";
  symlinkSync(join(dir, basename(doc.url)), join(dir, symlink));
  assert.equal((await edit([{ ...doc, url: "/api/event-documents/" + symlink }])).res.status, 400);
  assert.equal((await fetch(api.base + "/api/event-documents/" + symlink, { headers: { Cookie: api.admin } })).status, 404);
  for (const [name, bytes] of [["Criteria.xlsx", xlsx], ["Памятка.txt", Buffer.from("Тестовая инструкция")], ["Rules.rtf", Buffer.from("{\\rtf1 Test rules}")]]) {
    const res = await upload(name, bytes); assert.equal(res.status, 201, name);
    const added = await res.json(); assert.equal((await edit([added])).res.status, 200);
    assert.deepEqual(Buffer.from(await (await fetch(api.base + added.url)).arrayBuffer()), bytes);
  }
  assert.equal(readdirSync(dir).filter((name) => !name.startsWith("0000")).length, 4, "Rejected uploads leave no files");
  assert.deepEqual(sanitizeEventDocuments([{ ...doc, url: "javascript:alert(1)" }, doc]), [doc]);
});

test("document column migrates legacy events without changing registrations, scores or account data", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const id = await api.create();
  await api.request("/registrations", { method: "POST", body: teamPayload(id) });
  const before = api.withDb((db) => ({ users: db.prepare("SELECT * FROM users").all(), students: db.prepare("SELECT * FROM students").all(), entries: db.prepare("SELECT * FROM entries").all() }));
  await api.stop(); api.withDb((db) => db.exec("ALTER TABLE events DROP COLUMN documents")); await api.start();
  assert.deepEqual((await api.request("/events/" + id)).data.documents, []);
  assert.deepEqual(api.withDb((db) => ({ users: db.prepare("SELECT * FROM users").all(), students: db.prepare("SELECT * FROM students").all(), entries: db.prepare("SELECT * FROM entries").all() })), before);
});
