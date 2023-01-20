import execa from "execa";

const MAX_ERROR_MESSAGE_LENGTH = 4_000;

export class ExecutionError extends Error {
  constructor(err_msg: string) {
    if (err_msg.length > MAX_ERROR_MESSAGE_LENGTH) {
      super(`Task failed to execute, output was too long and has been truncated. 
      The final bit was:\n${err_msg.substring(
        err_msg.length - MAX_ERROR_MESSAGE_LENGTH,
      )}`);
    } else {
      super(`Task failed to execute with: ${err_msg}`);
    }
  }
}

/**
 * Executes a given shell command on a subprocess.
 *
 * @throws {ExecutionError}
 */
export const executeTask = async (file: string, args: string[]) => {
  try {
    const { stdout } = await execa(file, args);
    return stdout;
  } catch (error) {
    throw new ExecutionError(`${error as string}`);
  }
};
