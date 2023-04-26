import { spawn } from "child_process";
import { NextApiRequest, NextApiResponse } from "next";

const REACT_PROJECT_PATH = "../../../test";

type CommandCallback = (data: any) => void;

type Command = {
  cmd: string;
  args: string[];
  cwd: string;
  stdOutCb?: CommandCallback;
  stdErrCb?: CommandCallback;
  exitCb?: CommandCallback;
};

const runCommand: (command: Command) => Promise<void> = (command) =>
  new Promise((res) => {
    const { cmd, args, cwd, stdOutCb, stdErrCb, exitCb } = command;

    const child = spawn(cmd, args, { cwd });

    child.stdout.on("data", (data) => {
      console.error(`Command "${cmd} ${args.join(" ")}" output: ${data}`);
      stdOutCb?.(data);
    });

    child.stderr.on("data", (data) => {
      console.error(`Command "${cmd} ${args.join(" ")}" err: ${data}`);
      stdErrCb?.(data);
    });

    child.on("exit", (data) => {
      console.log(
        `Command "${cmd} ${args.join(" ")}" exited with code: ${data}`,
      );
      exitCb?.(data);
      res(undefined);
    });
  });

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
      console.log("-----------------");
      console.log(data.toString());
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

  await runCommand({
    cmd: "docker",
    args: ["build", "-t", "my-react-app-test", "."],
    cwd: REACT_PROJECT_PATH,
  });

  await runCommand({
    cmd: "docker",
    args: ["run", "-d", "-p", "3001:3000", "my-react-app-test"],
    cwd: REACT_PROJECT_PATH,
    stdOutCb: (data) => {
      newContainerId = data.toString().trim();
    },
  });

  res.status(200).send(newContainerId);
}
