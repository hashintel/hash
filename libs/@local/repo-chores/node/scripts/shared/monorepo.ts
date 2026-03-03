import path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";

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
  const { stdout } = await execa("yarn", ["workspaces", "list", "--json"], {
    env: { PATH: process.env.PATH },
    extendEnv: false, // Avoid passing FORCE_COLOR to a sub-process
  });

  return Object.fromEntries(
    stdout
      .split("\n")
      .map((line) => JSON.parse(line) as YarnWorkspaceInfo)
      .map((workspaceInfo) => [workspaceInfo.name, workspaceInfo] as const),
  );
};
