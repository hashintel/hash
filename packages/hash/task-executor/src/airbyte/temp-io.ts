import { promises as fs } from "node:fs";
import path from "node:path";

const SECRETS_DIR = "/var/run/task-executor-secrets";

export const writeToTempFile = async (
  fileName: string,
  fileContents: string,
): Promise<string> => {
  const tmpDir = await fs.mkdtemp(`${SECRETS_DIR}${path.sep}`);
  const filePath = `${tmpDir}${path.sep}${fileName}`;
  await fs.writeFile(filePath, fileContents);

  return filePath;
};
