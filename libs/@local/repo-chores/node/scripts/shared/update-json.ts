import { execa } from "execa";
import fs from "fs-extra";

export const updateJson = async (
  jsonFilePath: string,
  // @todo consider avoiding argument mutation and improve typings if the function is used more widely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (existingJson: any) => void,
) => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const rawJson = await fs.readFile(jsonFilePath, "utf8");
  const json = JSON.parse(rawJson);

  transform(json);

  const { stdout: output } = await execa(
    "biome",
    ["format", `--stdin-file-path=${jsonFilePath}`],
    {
      input: JSON.stringify(json, null, 2),
    },
  );

  if (output !== rawJson) {
    await fs.writeFile(jsonFilePath, output);
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
};
