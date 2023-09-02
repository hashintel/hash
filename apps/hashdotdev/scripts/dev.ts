import chalk from "chalk";
import { execa } from "execa";

const script = async () => {
  console.log(chalk.bold("Launching site in dev mode..."));

  await import("./codegen");

  await execa("next", ["dev"], { stdio: "inherit" });
};

await script();
