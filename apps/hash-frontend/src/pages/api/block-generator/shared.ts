import { spawn } from "child_process";

export const PREVIEW_PROJECT_PATH = "src/pages/block-generator/preview";

export type CommandCallback = (data: any) => void;

export type Command = {
  cmd: string;
  args: string[];
  cwd: string;
  stdOutCb?: CommandCallback;
  stdErrCb?: CommandCallback;
  exitCb?: CommandCallback;
};

export const runCommand: (command: Command) => Promise<void> = (command) =>
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
