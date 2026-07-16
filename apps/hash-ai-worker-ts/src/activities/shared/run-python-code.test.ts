import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  kill: vi.fn(),
  runCode: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: { create: mocks.create },
}));

import { runPythonCode } from "./run-python-code.js";

describe("runPythonCode", () => {
  beforeEach(() => {
    mocks.kill.mockReset();
    mocks.runCode.mockReset();
    mocks.runCode.mockResolvedValue({
      error: undefined,
      logs: { stdout: ["[]"], stderr: [] },
    });
    mocks.write.mockReset();
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({
      files: { write: mocks.write },
      kill: mocks.kill,
      runCode: mocks.runCode,
    });
  });

  it("exposes the absolute data path through both supported mechanisms", async () => {
    await runPythonCode({
      code: "print('[]')",
      dataJson: '{"entities":[]}',
      requestId: "request-id",
    });

    const dataFilePath = "/home/user/request-id_data.json";
    expect(mocks.create).toHaveBeenCalledWith({ allowInternetAccess: false });
    expect(mocks.write).toHaveBeenCalledWith(dataFilePath, '{"entities":[]}');
    expect(mocks.runCode).toHaveBeenCalledWith(
      expect.stringContaining(`DATA_FILE_PATH = "${dataFilePath}"`),
    );
    expect(mocks.runCode).toHaveBeenCalledWith(
      expect.stringContaining(
        `__hash_runtime_os.environ["DATA_FILE_PATH"] = DATA_FILE_PATH`,
      ),
    );
    expect(mocks.runCode).toHaveBeenCalledWith(
      expect.stringContaining(
        `__hash_runtime_os.chdir(__hash_runtime_os.path.dirname(DATA_FILE_PATH))`,
      ),
    );
    expect(mocks.kill).toHaveBeenCalledOnce();
  });
});
