import path from "node:path";

import execa from "execa";

export const monorepoRootDirPath = path.resolve(__dirname, "../../../../..");

type YarnWorkspaceInfo = {
  location: string;
  workspaceDependencies: string[];
  mismatchedWorkspaceDependencies: string[];
};

export const getWorkspaceInfoLookup = async (): Promise<
  Record<string, YarnWorkspaceInfo>
> => {
  const { stdout } = await execa("yarn", ["--silent", "workspaces", "info"], {
    env: { PATH: process.env.PATH },
    extendEnv: false, // Avoid passing FORCE_COLOR to a sub-process
  });

  return JSON.parse(stdout) as Record<string, YarnWorkspaceInfo>;
};
