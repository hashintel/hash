import { promises as fs } from "node:fs";
import path from "node:path";
import * as os from "node:os";

export const writeToTempFile = async (
  fileName: string,
  fileContents: string,
): Promise<string> => {
  const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${path.sep}`);
  const filePath = `${tmpDir}${path.sep}${fileName}`;
  await fs.writeFile(filePath, fileContents);

  return filePath;
};
