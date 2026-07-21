import { Sandbox } from "@e2b/code-interpreter";

/**
 * Execute a Python script in an E2B sandbox against a JSON dataset.
 *
 * The dataset is written to a file in the sandbox. Its absolute path is
 * exposed both as a Python `DATA_FILE_PATH` global and as an environment
 * variable of the same name, and the working directory is set to the file's
 * directory. The script is expected to print its result (JSON) to stdout.
 */
export const runPythonCode = async (params: {
  code: string;
  dataJson: string;
  /** Unique identifier used to namespace the data file within the sandbox */
  requestId: string;
}): Promise<{ stdout: string; stderr: string }> => {
  const { code, dataJson, requestId } = params;

  const sandbox = await Sandbox.create({ allowInternetAccess: false });

  try {
    const dataFilePath = `/home/user/${requestId}_data.json`;
    await sandbox.files.write(dataFilePath, dataJson);

    /**
     * Prefer the injected Python global, which is the documented contract.
     * Also populate the environment variable and use a stable working
     * directory so otherwise-correct model-generated scripts remain portable
     * if they use `os.environ` or take the path's basename.
     */
    const codeWithDataPath = `import os as __hash_runtime_os
DATA_FILE_PATH = ${JSON.stringify(dataFilePath)}
__hash_runtime_os.environ["DATA_FILE_PATH"] = DATA_FILE_PATH
__hash_runtime_os.chdir(__hash_runtime_os.path.dirname(DATA_FILE_PATH))
${code}`;
    const execution = await sandbox.runCode(codeWithDataPath);

    return {
      stdout: execution.logs.stdout.join(""),
      stderr: [
        ...execution.logs.stderr,
        ...(execution.error ? [execution.error.traceback] : []),
      ].join(""),
    };
  } finally {
    await sandbox.kill();
  }
};
