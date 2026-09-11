import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(resolve(root, "artifacts"), { recursive: true });
const log = openSync(resolve(root, "artifacts/server.log"), "a");
const child = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186"],
  {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
  },
);
child.unref();
writeFileSync(resolve(root, "artifacts/server.pid"), String(child.pid));
console.log(
  `Vite started as PID ${child.pid}. See artifacts/server.log for the selected port.`,
);
