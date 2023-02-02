import chalk from "chalk";

/**
 * This error can be used in scripts instead of console.log(chalk.red("..."")); process.exit(1)
 */
export class UserFriendlyError extends Error {}

if (typeof process !== "undefined") {
  process.on("uncaughtException", (error) => {
    if (error instanceof UserFriendlyError) {
      if (error.message) {
        console.log(chalk.red(error.message));
      }
    } else {
      console.log(error);
    }
    process.exit(1);
  });
}
