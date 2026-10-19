import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const maxImageBytes = 8 * 1024 * 1024;
export const uploadDir = resolve(process.env.DATA_DIR || ".data", "uploads");
export const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const safeFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function imagePath(filename) {
  if (typeof filename !== "string" || !safeFilename.test(filename)) return null;
  const path = resolve(uploadDir, filename);
  try {
    return lstatSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

export function isExistingEventImage(value) {
  if (value === "") return true;
  if (typeof value !== "string" || !value.startsWith("/api/event-images/"))
    return false;
  return Boolean(imagePath(value.slice("/api/event-images/".length)));
}

function matchesImageType(bytes, type) {
  if (type === "image/jpeg")
    return (
      bytes.length >= 5 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9
    );
  if (type === "image/png")
    return (
      bytes.length >= 45 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0 &&
      bytes.readUInt32BE(bytes.length - 12) === 0 &&
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND"
    );
  if (type === "image/webp")
    return (
      bytes.length >= 20 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP" &&
      bytes.readUInt32LE(4) === bytes.length - 8 &&
      ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)) &&
      bytes.readUInt32LE(16) > 0 &&
      bytes.readUInt32LE(16) <= bytes.length - 20
    );
  return false;
}

export function storeEventImage(bytes, type) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    !matchesImageType(bytes, type)
  )
    return null;
  mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  const filename = `${randomUUID()}.${imageTypes[type]}`;
  writeFileSync(resolve(uploadDir, filename), bytes, {
    mode: 0o600,
    flag: "wx",
  });
  return `/api/event-images/${filename}`;
}
