import { spawn } from "node:child_process";
import { createServer } from "node:net";

const [preferredPortArgument, command, ...args] = process.argv.slice(2);
const preferredPort = Number(preferredPortArgument);

if (
  !Number.isInteger(preferredPort) ||
  preferredPort < 1 ||
  preferredPort > 65_535 ||
  !command
) {
  throw new Error("Expected a preferred port followed by a command to run");
}

const tryPort = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine the allocated port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });

const port = await tryPort(preferredPort).catch((error) => {
  if (error.code === "EADDRINUSE") {
    return tryPort(0);
  }

  throw error;
});
console.log(`Starting on automatically allocated port ${port}`);

const child = spawn(command, args, {
  env: { ...process.env, PORT: String(port) },
  shell: process.platform === "win32",
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (code !== null) {
    process.exitCode = code;
  } else if (signal) {
    process.exitCode = 1;
  }
});
