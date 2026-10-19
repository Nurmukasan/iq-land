import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const dir = mkdtempSync(join(tmpdir(), "iqland-production-"));
let child, base, account;
let errors = "";

before(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, NODE_ENV: "production", PORT: String(port), DATA_DIR: dir };
  delete env.HOST; // Exercise the production loopback default.
  child = spawn(process.execPath, ["server/index.js"], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => { errors += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) { ready = true; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "Production server did not start: " + errors);
  account = JSON.parse(readFileSync(join(dir, "initial-accounts.json"), "utf8"))
    .find((user) => user.role === "admin");
});

after(async () => {
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
});

// Simulate the HTTP request Nginx sends to the local upstream after TLS ends.
function login({ ip = "198.51.100.1", origin = "https://iq-land.academy", body = {} } = {}) {
  // node:http allows an explicit Host, exactly as Nginx sends it upstream.
  // Fetch may replace that header with the URL's host.
  return new Promise((resolve, reject) => {
    const req = httpRequest(base + "/api/auth/login", {
      method: "POST",
      headers: {
        Host: "iq-land.academy",
        Origin: origin,
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        "X-Forwarded-Proto": "https",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode,
        headers: response.headers,
      })));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("production login behind local TLS proxy preserves origin and Secure session", async () => {
  const res = await login({ body: { email: account.email, password: account.password } });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; SameSite=Lax/i);
  const me = await fetch(base + "/api/auth/me", {
    headers: { Host: "iq-land.academy", Cookie: cookie.split(";")[0] },
  });
  assert.equal((await me.json()).user.role, "admin");
  assert.ok(res.headers.get("content-security-policy"));
});

test("rate limits behind Nginx are per visitor and do not trust arbitrary proxy chains", async () => {
  // Invalid input returns before bcrypt, but still consumes the real limiter.
  for (let i = 0; i < 20; i++) {
    assert.equal((await login({ ip: "198.51.100.20" })).status, 400);
  }
  assert.equal((await login({ ip: "198.51.100.20" })).status, 429);
  assert.equal((await login({ ip: "198.51.100.21" })).status, 400);
  // The first non-loopback hop is authoritative, rather than a spoofed prefix.
  assert.equal((await login({ ip: "203.0.113.123, 198.51.100.20" })).status, 429);
  assert.equal((await login({ ip: "203.0.113.123, 198.51.100.22" })).status, 400);
  assert.doesNotMatch(errors, /ERR_ERL_UNEXPECTED_X_FORWARDED_FOR|ERR_ERL_PERMISSIVE_TRUST_PROXY/);
});

test("proxy deployment still rejects requests from other sites", async () => {
  const res = await login({ origin: "https://other.example" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "Запрос с другого сайта отклонён");
});
