import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOCUMENT_TYPES, documentExtension, documentFilename, MAX_DOCUMENT_BYTES } from "../shared/event-documents.js";

const documentDir = resolve(process.env.DATA_DIR || ".data", "documents");
export function documentFile(filename) {
  if (typeof filename !== "string" || !documentFilename.test(filename)) return null;
  const path = resolve(documentDir, filename);
  try {
    const stat = lstatSync(path);
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_DOCUMENT_BYTES
      ? { path, size: stat.size } : null;
  } catch {
    return null;
  }
}
export function existingDocument(url) {
  return typeof url === "string" && url.startsWith("/api/event-documents/")
    ? documentFile(url.slice("/api/event-documents/".length)) : null;
}
// Inspect ZIP directory entries without extracting or inflating user documents.
function officePackage(bytes, required) {
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) return false;
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < Math.max(0, bytes.length - 65557) || end + 22 > bytes.length) return false;
  if (end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length ||
      bytes.readUInt32LE(end + 4) !== 0) return false;
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16);
  if (!count || count > 10000 || bytes.readUInt16LE(end + 8) !== count ||
      start + bytes.readUInt32LE(end + 12) !== end) return false;
  const names = new Set();
  let offset = start;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) return false;
    const length = bytes.readUInt16LE(offset + 28);
    const next = offset + 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (next > end || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 ||
        (bytes.readUInt16LE(offset + 8) & 1)) return false;
    names.add(bytes.toString("utf8", offset + 46, offset + 46 + length));
    offset = next;
  }
  return offset === end && names.has("[Content_Types].xml") && names.has(required);
}
function matchesDocument(bytes, ext) {
  if (ext === "pdf") return /^%PDF-\d\.\d/.test(bytes.toString("ascii", 0, 8)) &&
    bytes.subarray(-2048).includes(Buffer.from("%%EOF"));
  if (["doc", "xls", "ppt"].includes(ext)) return bytes.length >= 512 &&
    bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")) &&
    bytes.readUInt16LE(28) === 0xfffe && [9, 12].includes(bytes.readUInt16LE(30));
  if (["docx", "xlsx", "pptx"].includes(ext)) return officePackage(bytes, {
    docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml",
  }[ext]);
  if (ext === "rtf") return /^\{\\rtf\d/.test(bytes.toString("ascii", 0, 8));
  if (ext === "txt") {
    try {
      return !new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("\0");
    } catch { return false; }
  }
  return false;
}
export function storeEventDocument(bytes, originalName) {
  const name = typeof originalName === "string"
    ? originalName.normalize("NFC").trim().replace(/[\x00-\x1f\x7f/\\]/g, "_") : "";
  const ext = documentExtension(name);
  if (Buffer.isBuffer(bytes) && bytes.length > MAX_DOCUMENT_BYTES)
    throw Object.assign(Error("Файл слишком большой. Максимальный размер — 20 МБ."), { status: 413 });
  if (!Object.hasOwn(DOCUMENT_TYPES, ext))
    throw Object.assign(Error("Поддерживаются PDF, Word, Excel, PowerPoint, RTF и TXT."), { status: 415 });
  if (!name || name.length > 180 || !Buffer.isBuffer(bytes) || !bytes.length || !matchesDocument(bytes, ext))
    throw Object.assign(Error("Файл пуст, повреждён или не соответствует указанному формату."), { status: 400 });
  mkdirSync(documentDir, { recursive: true, mode: 0o700 });
  const filename = `${randomUUID()}.${ext}`;
  writeFileSync(resolve(documentDir, filename), bytes, { flag: "wx", mode: 0o600 });
  return { url: `/api/event-documents/${filename}`, name, size: bytes.length };
}
