import { createInterface } from "readline";

/**
 * Create an active bound readline interface using `stdin` and `stdout`.
 *
 * @param {function(string): void} callback handler for each inputed line
 * @returns {readline.ReadLine} the active configured interface
 */
export function createReadlineInterface(
  callback: (message: string) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      // 0/10 Inspired by https://stackoverflow.com/a/20087094/14687716
      terminal: false, // no TTY prompt interaction
    });

    // More events at: https://nodejs.org/api/readline.html#readline_class_interface
    rl.on("line", (line) => {
      callback(line);
    });

    rl.on("close", () => {
      resolve();
    });
  });
}
