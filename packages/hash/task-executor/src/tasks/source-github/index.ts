import { promises as fs } from "fs";
import { sep } from "path";
import * as os from "os";
import { executeTask } from "../../execution";

export type SourceGithubConfig = {
  access_token: String;
  repositories: String[];
  start_date: Date;
  request_timeout: number;
};

/**
 * @todo
 *
 */
export const runGithub = async (config: SourceGithubConfig) => {
  const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${sep}`);
  const configPath = `${tmpDir}${sep}config.json`;
  await fs.writeFile(configPath, JSON.stringify(config));

  return await executeTask("docker", [
    "run",
    "source-github",
    "--config",
    configPath,
    " --properties",
    "./src/tasks/source-github/properties.json",
  ]);
};
