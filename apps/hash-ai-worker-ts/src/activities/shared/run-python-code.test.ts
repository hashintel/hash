import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  create: vi.fn(),
  runPython: vi.fn(),
  write: vi.fn(),
}));

vi.mock("e2b", () => ({
  CodeInterpreter: { create: mocks.create },
}));

import { runPythonCode } from "./run-python-code.js";

describe("runPythonCode", () => {
  beforeEach(() => {
    mocks.close.mockReset();
    mocks.runPython.mockReset();
    mocks.runPython.mockResolvedValue({ stdout: "[]", stderr: "" });
    mocks.write.mockReset();
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({
      close: mocks.close,
      filesystem: { write: mocks.write },
      runPython: mocks.runPython,
    });
  });

  it("exposes the absolute data path through both supported mechanisms", async () => {
    await runPythonCode({
      code: "print('[]')",
      dataJson: '{"entities":[]}',
      requestId: "request-id",
    });

    const dataFilePath = "/home/user/request-id_data.json";
    expect(mocks.write).toHaveBeenCalledWith(dataFilePath, '{"entities":[]}');
    expect(mocks.runPython).toHaveBeenCalledWith(
      expect.stringContaining(`DATA_FILE_PATH = "${dataFilePath}"`),
    );
    expect(mocks.runPython).toHaveBeenCalledWith(
      expect.stringContaining(
        `__hash_runtime_os.environ["DATA_FILE_PATH"] = DATA_FILE_PATH`,
      ),
    );
    expect(mocks.runPython).toHaveBeenCalledWith(
      expect.stringContaining(
        `__hash_runtime_os.chdir(__hash_runtime_os.path.dirname(DATA_FILE_PATH))`,
      ),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
