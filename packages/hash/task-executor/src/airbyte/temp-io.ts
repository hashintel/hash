import { promises as fs } from "node:fs";
import * as os from "node:os";
import path from "node:path";

export const writeToTempFile = async (
  fileName: string,
  fileContents: string,
): Promise<string> => {
  const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${path.sep}`);
  const filePath = `${tmpDir}${path.sep}${fileName}`;
  await fs.writeFile(filePath, fileContents);

  return filePath;
};
