import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const monorepoRootDirPath = path.resolve(__dirname, "../../../../../..");

type YarnWorkspaceInfo = {
  location: string;
  name: string;
};

export const getWorkspaceInfoLookup = async (): Promise<
  Record<string, YarnWorkspaceInfo>
> => {
  const { stdout } = await execFileAsync(
    "yarn",
    ["workspaces", "list", "--json"],
    {
      // Replaces the whole environment, to avoid passing FORCE_COLOR to a sub-process
      env: { PATH: process.env.PATH },
    },
  );

  return Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as YarnWorkspaceInfo)
      .map((workspaceInfo) => [workspaceInfo.name, workspaceInfo] as const),
  );
};
