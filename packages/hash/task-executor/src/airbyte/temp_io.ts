import { promises as fs } from "fs";
import { sep } from "path";
import * as os from "os";

export const writeToTempFile = async (
  fileName: string,
  fileContents: string,
): Promise<string> => {
  const tmpDir = await fs.mkdtemp(`${os.tmpdir()}${sep}`);
  const filePath = `${tmpDir}${sep}${fileName}`;
  await fs.writeFile(filePath, fileContents);

  return filePath;
};
