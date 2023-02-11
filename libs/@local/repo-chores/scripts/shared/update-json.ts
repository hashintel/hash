import fs from "fs-extra";
import { format } from "prettier";

export const updateJson = async (
  jsonFilePath: string,
  // @todo consider avoiding argument mutation and improve typings if the function is used more widely
  transform: (existingJson: any) => void,
) => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const rawJson = await fs.readFile(jsonFilePath, "utf8");
  const json = JSON.parse(rawJson);

  transform(json);

  const newRawJson = format(JSON.stringify(json), {
    filepath: jsonFilePath,
  });

  if (rawJson !== newRawJson) {
    await fs.writeFile(jsonFilePath, newRawJson);
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
};
