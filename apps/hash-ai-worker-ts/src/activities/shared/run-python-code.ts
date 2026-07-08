import { CodeInterpreter } from "e2b";

/**
 * Execute a Python script in an E2B sandbox against a JSON dataset.
 *
 * The dataset is written to a file in the sandbox, and its path is exposed to
 * the script via a `DATA_FILE_PATH` variable prepended to the code. The script
 * is expected to print its result (JSON) to stdout.
 */
export const runPythonCode = async (params: {
  code: string;
  dataJson: string;
  /** Unique identifier used to namespace the data file within the sandbox */
  requestId: string;
}): Promise<{ stdout: string; stderr: string }> => {
  const { code, dataJson, requestId } = params;

  const sandbox = await CodeInterpreter.create();

  try {
    const dataFilePath = `/home/user/${requestId}_data.json`;
    await sandbox.filesystem.write(dataFilePath, dataJson);

    const codeWithDataPath = `DATA_FILE_PATH = "${dataFilePath}"\n${code}`;
    const response = await sandbox.runPython(codeWithDataPath);

    return {
      stdout: response.stdout,
      stderr: response.stderr,
    };
  } finally {
    await sandbox.close();
  }
};
