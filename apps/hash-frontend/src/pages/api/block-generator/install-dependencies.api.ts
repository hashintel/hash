import { NextApiRequest, NextApiResponse } from "next";
import { PREVIEW_PROJECT_PATH, runCommand } from "./shared";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runCommand({
    cmd: "docker",
    args: [
      "exec",
      req.body.containerId,
      "sh",
      "-c",
      `npm install ${req.body.dependencies.join(" ")}`,
    ],
    cwd: PREVIEW_PROJECT_PATH,
  });

  res.status(200).send("Ok");
}
