export const MAX_EVENT_DOCUMENTS = 10;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
};
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES).map((ext) => `.${ext}`).join(",");
export const documentFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|docx?|xlsx?|pptx?|rtf|txt)$/;
export const documentExtension = (name) => String(name || "").split(".").at(-1).toLowerCase();
export function sanitizeEventDocuments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EVENT_DOCUMENTS).filter((doc) =>
    typeof doc?.url === "string" && doc.url.startsWith("/api/event-documents/") &&
    documentFilename.test(doc.url.slice("/api/event-documents/".length)) &&
    typeof doc.name === "string" && doc.name.trim().length > 0 && doc.name.length <= 180 &&
    Number.isInteger(doc.size) && doc.size > 0 && doc.size <= MAX_DOCUMENT_BYTES,
  ).map(({ name, url, size }) => ({ name, url, size }));
}
