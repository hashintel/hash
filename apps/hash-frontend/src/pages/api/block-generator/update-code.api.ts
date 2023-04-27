import fs from "fs";
import { NextApiRequest, NextApiResponse } from "next";
import { PREVIEW_PROJECT_PATH, runCommand } from "./shared";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const filePath = `${PREVIEW_PROJECT_PATH}/src/App.js`;

  fs.writeFile(filePath, req.body.code, async (err) => {
    if (err) {
      console.error(err);
      return;
    }

    console.log("The file has been saved.");

    await runCommand({
      cmd: "docker",
      args: ["cp", `src/App.js`, `${req.body.containerId}:app/src/App.js`],
      cwd: PREVIEW_PROJECT_PATH,
    });

    res.status(200).send("Ok");
  });
}
