import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const listener = createServer((socket) => socket.end());
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const address = listener.address();
assert(address && typeof address === "object");
try {
  for (const [mode, profile] of [
    ["deny", "deny-network.sb"],
    ["deny", "commit-network.sb"],
    ["loopback", "loopback-only.sb"],
  ]) {
    const child = spawn(
      "sandbox-exec",
      [
        "-D",
        "SIGNING_SOCKET=/tmp/m7-signing-guard-unconnected",
        "-D",
        "SIGNING_SOCKET_REAL=/private/tmp/m7-signing-guard-unconnected",
        "-f",
        `${directory}/${profile}`,
        "/bin/sh",
        "-c",
        'java -Djava.net.preferIPv4Stack=true "$1/NetworkGuard.java" "$2" "$3" && "$4" --input-type=module -e "$5"',
        "guard",
        directory,
        mode,
        String(address.port),
        process.execPath,
        `import assert from 'node:assert/strict'; import net from 'node:net';
       const connect = (host) => new Promise((resolve) => { const socket = net.connect({ host, port: ${address.port} }); socket.setTimeout(1000); socket.once('connect', () => { socket.destroy(); resolve('connected'); }); socket.once('error', (error) => resolve(error.code)); socket.once('timeout', () => { socket.destroy(); resolve('timeout'); }); });
       assert.equal(await connect('192.0.2.1'), 'EPERM');
       assert.equal(await connect('127.0.0.1'), '${mode === "loopback" ? "connected" : "EPERM"}');
       console.log('Node descendant: external EPERM; loopback ${mode === "loopback" ? "connected" : "EPERM"}');`,
      ],
      { stdio: "inherit" },
    );
    const [code] = await once(child, "exit");
    assert.equal(code, 0, `${profile} descendant guard failed`);
    console.log(
      `PASS ${profile}: shell -> Java / Node descendants inherit denial`,
    );
  }
} finally {
  listener.close();
}
