import { spawn } from "child_process";
import fs from "fs";
import { NextApiRequest, NextApiResponse } from "next";

const REACT_PROJECT_PATH = "../../../test";

let containerId = "";

type Command = {
  cmd: string;
  args: string[];
  cwd: string;
  options?: { [k: string]: string };
};

const file = `const ButtonComponent = () => {
  return (
    <MUI.Button variant="contained" color="primary" sx={{background: "purple"}}>
      Click me
    </MUI.Button>
  );
}

render(<ButtonComponent />);`;

const commands: Command[] = [
  {
    cmd: "yarn",
    args: ["install"],
    cwd: REACT_PROJECT_PATH,
  },
  {
    cmd: "docker",
    args: ["build", "-t", "my-react-app-test", "."],
    cwd: REACT_PROJECT_PATH,
    options: { t: "my-react-app-test" },
  },
  {
    cmd: "docker",
    args: ["run", "-d", "-p", "3001:3000", "my-react-app-test"],
    cwd: REACT_PROJECT_PATH,
  },
];

const runContainerCmd = {
  cmd: "docker",
  args: ["run", "-d", "-p", "3001:3000", "my-react-app-test"],
  cwd: REACT_PROJECT_PATH,
};

const installDependenciesCmd = {
  cmd: "yarn",
  args: ["add"],
  cwd: REACT_PROJECT_PATH,
};

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

const runContainer: Promise<string> = () =>
  new Promise((res) => {
    const { cmd, args, cwd } = runContainerCmd;
    let containerId = "";

    const child = spawn(cmd, args, {
      cwd,
    });

    child.stdout.on("data", (data) => {
      containerId = data.toString();
    });
    // child.stdout.on("data", (code) => {
    //   console.log("inside");
    //   console.log(code);
    //   console.log(
    //     `Command "${cmd} ${args.join(" ")}" exited with code ${code}`,
    //   );

    //   res(code);
    // });

    child.on("exit", (code) => {
      console.log(
        `Command "${cmd} ${args.join(" ")}" exited with code ${code}`,
      );
      res(containerId);
    });
  });

const writeFile = (containerId: string, file: string) => {
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
    });
  });
};

const installDependencies = (dependencies: string) => {
  const { cmd, args, cwd } = installDependenciesCmd;

  const child = spawn(cmd, args.concat([dependencies]), {
    cwd,
  });

  child.on("exit", (code) => {
    console.log(`Command "${cmd} ${args.join(" ")}" exited with code ${code}`);
  });
};

const runCommand = (index: number, cb?: () => void) => {
  if (index >= commands.length) {
    console.log("All commands have been executed.");

    cb?.();
    return;
  }

  const command = commands[index];

  if (command) {
    const { cmd, args, cwd } = command;

    console.log(
      `--------------------------------------------------------------`,
    );
    console.log(
      `Executing command "${cmd} ${args.join(" ")}" in directory ${cwd}`,
    );

    const child = spawn(cmd, args, { cwd, stdio: "inherit" });

    child.on("exit", (code) => {
      console.log(
        `Command "${cmd} ${args.join(" ")}" exited with code ${code}`,
      );
      runCommand(index + 1, cb);
    });
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("initial - " + containerId);
  // runCommand(0);
  // writeFile(req.body.code);
  // installDependencies(req.body.dependencies);
  console.log("got here");
  containerId = await runContainer().then((containerId) => {
    console.log("GOT CONTAIENR ID :");
    console.log(containerId);
    containerId = containerId;
    setTimeout(() => {
      const child = spawn("docker", ["ps"]);

      child.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });
      child.on("exit", (code) => {
        console.log(code);
      });
      writeFile(containerId, req.body.code);
    }, 10000);
  });
  // runCommand(0, () => res.status(200).send("Ok"));
}
