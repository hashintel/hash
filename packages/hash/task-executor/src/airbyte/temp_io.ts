import { promises as fs } from "fs";
import path from "path";
import * as os from "os";

export const writeToTempFile = async (
  fileName: string,
  fileContents: string,
): Promise<string> => {
  const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${path.sep}`);
  const filePath = `${tmpDir}${path.sep}${fileName}`;
  await fs.writeFile(filePath, fileContents);

  return filePath;
};
