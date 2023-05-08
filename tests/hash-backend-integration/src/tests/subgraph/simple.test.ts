import path from "node:path";

import { restoreSnapshot } from "../setup";

jest.setTimeout(60000);

describe("Simple test", () => {
  it("can upload a snapshot", async () => {
    await restoreSnapshot(path.join(__dirname, "simple.jsonl"));
  });
});
