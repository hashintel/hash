import { spawn } from "child_process";
import fs from "fs";
import { NextApiRequest, NextApiResponse } from "next";

const REACT_PROJECT_PATH = "../../../test";

const getWriteFileCmd = (containerId: string, file: string) => ({
  cmd: "docker",
  args: ["cp", `src/App.js`, `${containerId}:app/src/App.js`],
  cwd: REACT_PROJECT_PATH,
});
// const getWriteFileCmd = (containerId: string, file: string) => ({
//   cmd: "docker",
//   args: [
//     "exec",
//     "4923c332e65f18f09b7ba2b239cd0607b0559122def9c0961924dad12f23021a",
//     "sh",
//     "-c",
//     `'echo "${file}" > ./src/App.js'`,
//   ],
//   cwd: ".",
// });

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
