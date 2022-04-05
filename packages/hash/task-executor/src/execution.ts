import execa from "execa";

/**
 * Executes a given shell command on a subprocess.
 *
 * @throws {ExecutionError}
 */
export const executeTask = async (file: string, args: string[]) => {
  try {
    const { stdout } = await execa(file, args);
    return stdout;
  } catch (error: any) {
    throw new ExecutionError(error.toString());
  }
};

export class ExecutionError extends Error {
  constructor(err_msg: string) {
    super(`Task failed to execute with: ${err_msg}`);
  }
}
