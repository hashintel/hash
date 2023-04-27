import { spawn } from "child_process";
import fs from "fs";
import { NextApiRequest, NextApiResponse } from "next";
import { REACT_PROJECT_PATH } from "./shared";

const getWriteFileCmd = (containerId: string, file: string) => ({
  cmd: "docker",
  args: ["cp", `src/App.js`, `${containerId}:app/src/App.js`],
  cwd: REACT_PROJECT_PATH,
});

const writeFile: Promise<void> = (containerId: string, file: string) =>
  new Promise((res) => {
    const filePath = `${REACT_PROJECT_PATH}/src/App.js`;

    fs.writeFile(filePath, file, (err) => {
      if (err) {
        console.error(err);
        return;
      }

      console.log("The file has been saved.");
      const { cmd, args, cwd } = getWriteFileCmd(containerId, file);

      const child = spawn(cmd, args, { cwd });

      console.log("ran");
      child.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });

      child.on("exit", (code) => {
        console.log(
          `Command "${cmd} ${args.join(" ")}" exited with code ${code}`,
        );
        res(undefined);
      });
    });
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  writeFile(req.body.containerId, req.body.code).then(() => {
    res.status(200).send("Ok");
  });
}
