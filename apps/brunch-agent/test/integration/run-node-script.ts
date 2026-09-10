import { spawn } from "node:child_process";

interface NodeScriptResult {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

export const runNodeScript = async (
  scriptPath: string,
  cwd: string,
  env: Readonly<Record<string, string>> = {},
): Promise<NodeScriptResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", scriptPath],
      {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    let stdout = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode, stderr, stdout });
    });
  });
