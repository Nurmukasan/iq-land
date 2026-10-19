import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";

const dataDir = mkdtempSync(join(tmpdir(), "iqland-video-storage-"));
const previousDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dataDir;
const {
  maxVideoBytes,
  videoTypes,
  videoUploadDir,
  videoPath,
  isExistingEventVideo,
  receiveEventVideo,
} = await import("../server/event-videos.js");
if (previousDataDir === undefined) delete process.env.DATA_DIR;
else process.env.DATA_DIR = previousDataDir;
test.after(() => rmSync(dataDir, { recursive: true, force: true }));

function box(type, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length + 8);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, data]);
}

function mp4(payload = Buffer.from([1, 2, 3, 4])) {
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\0\0isommp42", "latin1")),
    box("moov", box("mvhd", Buffer.alloc(16))),
    box("mdat", payload),
  ]);
}

function element(id, payload) {
  assert.ok(payload.length < 127);
  return Buffer.concat([
    Buffer.from(id, "hex"),
    Buffer.from([0x80 | payload.length]),
    payload,
  ]);
}

function webm({
  unknownSegment = false,
  unknownCluster = false,
  docType = "webm",
} = {}) {
  const header = element("1a45dfa3", element("4282", Buffer.from(docType)));
  const tracks = element("1654ae6b", element("ae", Buffer.from([0x81])));
  const clusterData = Buffer.from([0xe7, 0x81, 0x00]);
  const cluster = unknownCluster
    ? Buffer.concat([Buffer.from("1f43b675ff", "hex"), clusterData])
    : element("1f43b675", clusterData);
  const body = Buffer.concat([tracks, cluster]);
  const segment = unknownSegment
    ? Buffer.concat([Buffer.from("18538067ff", "hex"), body])
    : element("18538067", body);
  return Buffer.concat([header, segment]);
}

function request(
  bytes,
  type = "video/mp4",
  { chunkSize = 7, length = bytes.length } = {},
) {
  function* chunks() {
    for (let offset = 0; offset < bytes.length; offset += chunkSize)
      yield bytes.subarray(offset, offset + chunkSize);
  }
  const req = Readable.from(chunks());
  req.headers = {
    "content-type": type,
    ...(length === null ? {} : { "content-length": String(length) }),
  };
  return req;
}

function files() {
  try {
    return readdirSync(videoUploadDir).sort();
  } catch {
    return [];
  }
}

async function rejectedWithoutFiles(req, status, options) {
  const before = files();
  await assert.rejects(
    receiveEventVideo(req, options),
    (error) => error.status === status && /[А-Яа-я]/.test(error.message),
  );
  assert.deepEqual(
    files(),
    before,
    "Failed requests must not leave temporary or final files",
  );
}

test("video configuration is independent of db initialization and accepts only strict owned filenames", () => {
  assert.equal(maxVideoBytes, 1024 ** 3);
  assert.deepEqual(videoTypes, { "video/mp4": "mp4", "video/webm": "webm" });
  assert.equal(videoUploadDir, join(dataDir, "uploads", "videos"));
  assert.deepEqual(
    readdirSync(dataDir),
    [],
    "Importing the storage helper must not initialize the DB or data directory",
  );
  assert.equal(isExistingEventVideo(""), true);
  for (const value of [
    null,
    undefined,
    5,
    "https://example.com/file.mp4",
    "/api/event-videos/../iqland.sqlite",
    "/api/event-videos/missing.mp4",
    "/api/event-videos/00000000-0000-4000-8000-000000000000.mp4",
  ]) {
    assert.equal(isExistingEventVideo(value), false);
  }
});

test("streamed MP4 and WebM retain their exact original bytes and become owned public URLs", async () => {
  for (const [type, bytes] of [
    ["video/mp4", mp4(Buffer.alloc(1024 * 1024, 123))],
    ["video/webm", webm()],
    ["video/webm", webm({ unknownSegment: true, unknownCluster: true })],
  ]) {
    const url = await receiveEventVideo(
      request(bytes, type, { chunkSize: 4093 }),
    );
    assert.match(url, /^\/api\/event-videos\/[0-9a-f-]{36}\.(mp4|webm)$/);
    assert.ok(url.endsWith(videoTypes[type]));
    assert.equal(isExistingEventVideo(url), true);
    assert.deepEqual(readFileSync(videoPath(basename(url))), bytes);
    assert.equal(videoPath(basename(url) + "?download=1"), null);
    assert.equal(isExistingEventVideo(url + "#video"), false);
  }
  assert.ok(files().every((name) => !name.endsWith(".part")));
});

test("oversized declared and chunked bodies are rejected and cleaned without trusting Content-Length", async () => {
  const bytes = mp4(Buffer.alloc(9 * 1024));
  await rejectedWithoutFiles(request(bytes), 413, { maxBytes: 8 * 1024 });
  await rejectedWithoutFiles(
    request(bytes, "video/mp4", { length: null }),
    413,
    { maxBytes: 8 * 1024 },
  );
  await rejectedWithoutFiles(request(bytes, "video/mp4", { length: 8 }), 413, {
    maxBytes: 8 * 1024,
  });
  await rejectedWithoutFiles(
    request(mp4(), "video/mp4", { length: maxVideoBytes + 1 }),
    413,
  );
  await rejectedWithoutFiles(request(mp4(), "video/mp4", { length: 99 }), 400);
});

test("unsupported MIME, spoofed signatures, empty and truncated containers leave no files", async () => {
  for (const [type, bytes, status] of [
    ["application/octet-stream", mp4(), 415],
    ["image/svg+xml", Buffer.from("<svg/>"), 415],
    ["video/mp4", Buffer.from("<svg>not video</svg>"), 400],
    ["video/mp4", webm(), 400],
    ["video/webm", mp4(), 400],
    ["video/mp4", Buffer.alloc(0), 400],
    ["video/webm", Buffer.alloc(0), 400],
    ["video/mp4", mp4().subarray(0, -1), 400],
    ["video/webm", webm().subarray(0, -1), 400],
    ["video/webm", webm({ docType: "matroska" }), 400],
    [
      "video/mp4",
      Buffer.concat([mp4(), Buffer.from("<html>extra</html>")]),
      400,
    ],
    ["video/webm", Buffer.concat([webm(), Buffer.from("extra")]), 400],
    ["video/mp4", box("ftyp", Buffer.from("isom\0\0\0\0isom", "latin1")), 400],
    [
      "video/webm",
      Buffer.from("1a45dfa3874282847765626d18538067ff", "hex"),
      400,
    ],
  ])
    await rejectedWithoutFiles(request(bytes, type), status);
});

test("client abort and source errors remove partial uploads", async () => {
  for (const abort of [true, false]) {
    let started = false;
    const req = new Readable({
      read() {
        if (started) return;
        started = true;
        this.push(mp4().subarray(0, 24));
        setImmediate(() => {
          if (abort) {
            this.aborted = true;
            this.emit("aborted");
          }
          this.destroy(new Error("Simulated connection reset"));
        });
      },
    });
    req.headers = { "content-type": "video/mp4" };
    await rejectedWithoutFiles(req, 400);
  }
});

test("filesystem failures return a useful error and do not leave artifacts", async () => {
  const before = files();
  // The upload directory itself cannot be a file; simulate this without chmod,
  // which does not reliably fail in privileged CI containers.
  const outsideBackup = join(dataDir, "video-storage-backup");
  renameSync(videoUploadDir, outsideBackup);
  writeFileSync(videoUploadDir, "not a directory");
  try {
    await assert.rejects(
      receiveEventVideo(request(mp4())),
      (error) => error.status === 500 && /[А-Яа-я]/.test(error.message),
    );
  } finally {
    rmSync(videoUploadDir, { force: true });
    renameSync(outsideBackup, videoUploadDir);
  }
  assert.deepEqual(files(), before);
});

test("videoPath rejects traversal, invalid UUIDs, directories and symlinks", () => {
  mkdirSync(videoUploadDir, { recursive: true });
  for (const name of [
    "../iqland.sqlite",
    "a.mp4",
    `${randomUUID()}.svg`,
    "00000000-0000-0000-0000-000000000000.mp4",
    `${randomUUID()}.mp4\0`,
  ])
    assert.equal(videoPath(name), null);
  const directory = `${randomUUID()}.mp4`;
  const symlink = `${randomUUID()}.webm`;
  mkdirSync(join(videoUploadDir, directory));
  symlinkSync(join(videoUploadDir, directory), join(videoUploadDir, symlink));
  try {
    assert.equal(videoPath(directory), null);
    assert.equal(videoPath(symlink), null);
  } finally {
    rmSync(join(videoUploadDir, symlink));
    rmSync(join(videoUploadDir, directory), { recursive: true });
  }
});
