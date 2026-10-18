import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createPortServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer, loadConfigFromFile } from "vite";

const dir = mkdtempSync(join(tmpdir(), "iqland-dev-proxy-"));
const apiPort = 35000 + Math.floor(Math.random() * 10000);
const apiUrl = `http://127.0.0.1:${apiPort}`;
let child, vite, origin, account;

before(async () => {
  let logs = "";
  child = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(apiPort), DATA_DIR: dir },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(apiUrl + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "Temporary API did not start: " + logs);
  account = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  ).find((user) => user.role === "admin");

  // Use the real project proxy settings, changing only the temporary API port.
  // Preserve string shorthand: Vite applies changeOrigin:true to that form.
  const { config } = await loadConfigFromFile({
    command: "serve",
    mode: "test",
  });
  const configuredProxy = config.server.proxy["/api"];
  // Vite resolves port:0 back to 5173. Reserve an unused port explicitly so
  // this regression check can run while the normal dev server is running.
  const reservation = createPortServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const proxyPort = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  vite = await createServer({
    ...config,
    configFile: false,
    cacheDir: join(dir, "vite-cache"),
    logLevel: "silent",
    server: {
      ...config.server,
      host: "127.0.0.1",
      port: proxyPort,
      strictPort: true,
      proxy: {
        "/api":
          typeof configuredProxy === "string"
            ? apiUrl
            : { ...configuredProxy, target: apiUrl },
      },
    },
  });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
});

after(async () => {
  await vite?.close();
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
});

test("admin login and session work through the actual Vite proxy", async () => {
  for (const frontend of [origin, origin.replace("127.0.0.1", "localhost")]) {
    const response = await fetch(frontend + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: frontend },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    assert.equal(body.user.role, "admin");
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const me = await fetch(frontend + "/api/auth/me", {
      headers: { Cookie: cookie },
    });
    assert.equal((await me.json()).user.role, "admin");
  }
});

test("Vite proxy still rejects mutations from other origins and ports", async () => {
  for (const source of ["https://untrusted.example", "http://localhost:1"]) {
    const response = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: source,
        "X-Forwarded-Host": new URL(source).host,
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
      }),
    });
    assert.equal(response.status, 403);
    assert.equal(
      (await response.json()).error,
      "Запрос с другого сайта отклонён",
    );
  }
});
