import { spawn } from "node:child_process";
import { createServer } from "node:net";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error("Expected a command to run");
}

const getAvailablePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
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

const port = await getAvailablePort();
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
