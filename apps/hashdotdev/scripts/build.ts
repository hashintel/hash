import chalk from "chalk";
import { execa } from "execa";

const script = async () => {
  console.log(chalk.bold("Building..."));

  await import("./codegen");

  await execa("next", ["build"], { stdio: "inherit" });
};

await script();
