import { randomUUID } from "node:crypto";
import { createWriteStream, lstatSync } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const maxVideoBytes = 1024 * 1024 * 1024;
export const videoUploadDir = resolve(
  process.env.DATA_DIR || ".data",
  "uploads",
  "videos",
);
export const videoTypes = Object.freeze({
  "video/mp4": "mp4",
  "video/webm": "webm",
});

const urlPrefix = "/api/event-videos/";
const prefixLimit = 64 * 1024;
const safeFilename =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|webm)$/;
const mp4Brands = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "iso7",
  "iso8",
  "iso9",
  "mp41",
  "mp42",
  "avc1",
  "avc3",
  "hvc1",
  "hev1",
  "M4V ",
  "MSNV",
  "dash",
  "cmfc",
  "cmfs",
]);

function uploadError(status, message) {
  return Object.assign(new Error(message), { status });
}

function invalidVideo() {
  return uploadError(400, "Файл повреждён или не является видео MP4/WebM.");
}

export function videoPath(filename) {
  if (typeof filename !== "string" || !safeFilename.test(filename)) return null;
  const path = resolve(videoUploadDir, filename);
  try {
    return lstatSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

export function isExistingEventVideo(value) {
  if (value === "") return true;
  return (
    typeof value === "string" &&
    value.startsWith(urlPrefix) &&
    Boolean(videoPath(value.slice(urlPrefix.length)))
  );
}

async function readHeader(file, position, length = 16) {
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await file.read(bytes, 0, length, position);
  return bytes.subarray(0, bytesRead);
}

function mp4Box(bytes, remaining) {
  if (bytes.length < 8) throw invalidVideo();
  const shortSize = bytes.readUInt32BE(0);
  const headerSize = shortSize === 1 ? 16 : 8;
  if (bytes.length < headerSize) throw invalidVideo();
  const largeSize =
    shortSize === 1 ? bytes.readBigUInt64BE(8) : BigInt(shortSize || remaining);
  if (largeSize < BigInt(headerSize) || largeSize > BigInt(remaining))
    throw invalidVideo();
  return {
    size: Number(largeSize),
    headerSize,
    type: bytes.toString("latin1", 4, 8),
  };
}

async function validateMp4(file, prefix, length) {
  const first = mp4Box(prefix, length);
  if (
    first.type !== "ftyp" ||
    first.size < first.headerSize + 8 ||
    first.size > prefix.length ||
    (first.size - first.headerSize) % 4 !== 0
  )
    throw invalidVideo();
  const brands = [
    prefix.toString("latin1", first.headerSize, first.headerSize + 4),
  ];
  for (let offset = first.headerSize + 8; offset < first.size; offset += 4) {
    brands.push(prefix.toString("latin1", offset, offset + 4));
  }
  if (!brands.some((brand) => mp4Brands.has(brand))) throw invalidVideo();

  let position = first.size;
  let metadata = false;
  let media = false;
  let boxes = 0;
  while (position < length) {
    // Bound adversarial files made entirely of tiny container headers.
    if (++boxes > 100_000) throw invalidVideo();
    const box = mp4Box(await readHeader(file, position), length - position);
    if (box.type === "moov" && box.size >= box.headerSize + 8) metadata = true;
    if (box.type === "mdat" && box.size > box.headerSize) media = true;
    position += box.size;
  }
  if (position !== length || !metadata || !media) throw invalidVideo();
}

// EBML IDs keep their leading marker; element sizes remove it. Unknown-size
// elements are represented by null and are legal for streaming WebM containers.
function vint(bytes, offset, isId = false) {
  if (offset >= bytes.length || bytes[offset] === 0) throw invalidVideo();
  let marker = 0x80;
  let width = 1;
  while (!(bytes[offset] & marker)) {
    marker >>= 1;
    width++;
  }
  if (width > (isId ? 4 : 8) || offset + width > bytes.length)
    throw invalidVideo();
  let value = BigInt(isId ? bytes[offset] : bytes[offset] & (marker - 1));
  for (let i = 1; i < width; i++)
    value = (value << 8n) | BigInt(bytes[offset + i]);
  const unknown = !isId && value === (1n << BigInt(width * 7)) - 1n;
  if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidVideo();
  return { width, value: unknown ? null : Number(value) };
}

function ebmlElement(bytes, offset = 0) {
  const id = vint(bytes, offset, true);
  const size = vint(bytes, offset + id.width);
  return { id: id.value, size: size.value, headerSize: id.width + size.width };
}

async function validateWebm(file, prefix, length) {
  const header = ebmlElement(prefix);
  if (
    header.id !== 0x1a45dfa3 ||
    header.size === null ||
    header.size < 7 ||
    header.headerSize + header.size > prefix.length
  )
    throw invalidVideo();
  const headerEnd = header.headerSize + header.size;
  let position = header.headerSize;
  let docType = false;
  while (position < headerEnd) {
    const element = ebmlElement(prefix, position);
    const contentStart = position + element.headerSize;
    if (element.size === null || contentStart + element.size > headerEnd)
      throw invalidVideo();
    if (element.id === 0x4282) {
      if (
        docType ||
        prefix.toString("latin1", contentStart, contentStart + element.size) !==
          "webm"
      )
        throw invalidVideo();
      docType = true;
    }
    position = contentStart + element.size;
  }
  if (!docType || position !== headerEnd) throw invalidVideo();

  const segment = ebmlElement(await readHeader(file, headerEnd));
  position = headerEnd + segment.headerSize;
  if (
    segment.id !== 0x18538067 ||
    (segment.size !== null && segment.size !== length - position)
  )
    throw invalidVideo();
  let tracks = false;
  let media = false;
  let elements = 0;
  while (position < length) {
    if (++elements > 100_000) throw invalidVideo();
    const element = ebmlElement(await readHeader(file, position));
    const contentStart = position + element.headerSize;
    if (element.size !== null && contentStart + element.size > length)
      throw invalidVideo();
    if (element.id === 0x1654ae6b && element.size > 0) tracks = true;
    if (
      element.id === 0x1f43b675 &&
      (element.size === null || element.size > 0)
    )
      media = true;
    if (element.size === null) {
      // Unknown-size Clusters are emitted by live MediaRecorder implementations.
      if (element.id !== 0x1f43b675 || contentStart >= length || !tracks)
        throw invalidVideo();
      position = length;
    } else position = contentStart + element.size;
  }
  if (position !== length || !tracks || !media) throw invalidVideo();
}

/** Stream an authenticated request to disk; never pass this route to a raw body parser. */
export async function receiveEventVideo(
  req,
  { maxBytes = maxVideoBytes } = {},
) {
  const type = String(req.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!Object.hasOwn(videoTypes, type)) {
    req.resume();
    throw uploadError(415, "Загрузите видео в формате MP4 или WebM.");
  }
  const limit =
    Number.isSafeInteger(maxBytes) && maxBytes > 0
      ? Math.min(maxBytes, maxVideoBytes)
      : maxVideoBytes;
  const lengthHeader = req.headers["content-length"];
  const announcedLength =
    typeof lengthHeader === "string" && /^\d+$/.test(lengthHeader)
      ? BigInt(lengthHeader)
      : null;
  if (announcedLength !== null && announcedLength > BigInt(limit)) {
    req.resume();
    throw uploadError(413, "Размер видео не должен превышать 1 ГБ.");
  }
  if (req.aborted || req.destroyed)
    throw uploadError(400, "Загрузка видео прервана.");

  const filename = `${randomUUID()}.${videoTypes[type]}`;
  const temporaryPath = resolve(videoUploadDir, `${filename}.part`);
  const finalPath = resolve(videoUploadDir, filename);
  const prefix = Buffer.alloc(prefixLimit);
  let prefixLength = 0;
  let received = 0;
  let limiter;
  let onAbort;
  let onError;
  let onClose;
  try {
    await mkdir(videoUploadDir, { recursive: true, mode: 0o700 });
    if (req.aborted || req.destroyed)
      throw uploadError(400, "Загрузка видео прервана.");
    limiter = new Transform({
      transform(chunk, encoding, done) {
        received += chunk.length;
        if (received > limit)
          return done(
            uploadError(413, "Размер видео не должен превышать 1 ГБ."),
          );
        const toCopy = Math.min(prefixLimit - prefixLength, chunk.length);
        if (toCopy > 0) {
          chunk.copy(prefix, prefixLength, 0, toCopy);
          prefixLength += toCopy;
        }
        done(null, chunk);
      },
    });
    onAbort = () =>
      limiter.destroy(uploadError(400, "Загрузка видео прервана."));
    onError = () =>
      limiter.destroy(uploadError(400, "Не удалось завершить загрузку видео."));
    onClose = () => {
      if (!req.readableEnded) onAbort();
    };
    req.once("aborted", onAbort);
    req.once("error", onError);
    req.once("close", onClose);

    // Keep IncomingMessage outside pipeline: a size/disk error must not destroy
    // its socket before Express has sent the corresponding JSON error response.
    const writing = pipeline(
      limiter,
      createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
    );
    req.pipe(limiter);
    await writing;
    if (
      !received ||
      (announcedLength !== null && announcedLength !== BigInt(received))
    )
      throw invalidVideo();
    const file = await open(temporaryPath, "r");
    try {
      const bytes = prefix.subarray(0, prefixLength);
      if (type === "video/mp4") await validateMp4(file, bytes, received);
      else await validateWebm(file, bytes, received);
    } finally {
      await file.close();
    }
    await rename(temporaryPath, finalPath);
    return urlPrefix + filename;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    if (error.status) throw error;
    throw uploadError(
      500,
      "Не удалось сохранить видео. Попробуйте загрузить его ещё раз.",
    );
  } finally {
    if (limiter) req.unpipe(limiter);
    if (onAbort) req.off("aborted", onAbort);
    if (onError) req.off("error", onError);
    if (onClose) req.off("close", onClose);
    if (!req.destroyed && !req.readableEnded) req.resume();
  }
}
