import { NextApiRequest, NextApiResponse } from "next";
import { PREVIEW_PROJECT_PATH, runCommand } from "./shared";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  let oldContainerIds: string[] = [];
  let newContainerId = "";

  await runCommand({
    cmd: "docker",
    args: [
      "ps",
      "-a",
      "-q",
      "--filter",
      "ancestor=my-react-app-test",
      `--format={{.ID}}`,
    ],
    cwd: ".",
    stdOutCb: (data) => {
      oldContainerIds = data.toString().split("\n").join(" ").trim().split(" ");
    },
  });

  if (oldContainerIds) {
    oldContainerIds.forEach(async (oldContainerId) => {
      await runCommand({
        cmd: "docker",
        args: ["stop", oldContainerId],
        cwd: ".",
      });
      await runCommand({
        cmd: "docker",
        args: ["rm", oldContainerId],
        cwd: ".",
      });
    });
  }

  if (req.body.dependencies) {
    await runCommand({
      cmd: "yarn",
      args: ["add", ...req.body.dependencies],
      cwd: PREVIEW_PROJECT_PATH,
    });
  }

  await runCommand({
    cmd: "docker",
    args: ["build", "-t", "my-react-app-test", "."],
    cwd: PREVIEW_PROJECT_PATH,
  });

  await runCommand({
    cmd: "docker",
    args: ["run", "-d", "-p", "3001:3000", "my-react-app-test"],
    cwd: PREVIEW_PROJECT_PATH,
    stdOutCb: (data) => {
      newContainerId = data.toString().trim();
    },
  });

  res.status(200).send(newContainerId);
}
