import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function testSkillActivation(prompt: string): string {
  const input = JSON.stringify({
    session_id: "test",
    prompt,
    cwd: ".",
    permission_mode: "auto",
    transcript_path: "",
  });

  try {
    return execSync("node skill-activation-prompt.ts", {
      cwd: __dirname,
      encoding: "utf-8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

async function createSnapshot(prompt: string) {
  const output = testSkillActivation(prompt);
  await expect(output).toMatchFileSnapshot(`./__snapshots__/${prompt}.snap`);
}

describe("Skill Activation Snapshots", () => {
  it("add error handling", ({ task }) => createSnapshot(task.name));

  it("fix eror handling", ({ task }) => createSnapshot(task.name));

  it("return Result with Report type", ({ task }) => createSnapshot(task.name));

  it("add tokio dependency", ({ task }) => createSnapshot(task.name));

  it("update dependencies", ({ task }) => createSnapshot(task.name));

  it("update Cargo.toml workspace dependencies", ({ task }) =>
    createSnapshot(task.name));

  it("improve documentation", ({ task }) => createSnapshot(task.name));

  it("fix documnetation", ({ task }) => createSnapshot(task.name));

  it("improve rust documentation", ({ task }) => createSnapshot(task.name));

  it("open a pull request", ({ task }) => createSnapshot(task.name));

  it("activates tracing guidance for a Rust logging macro", () => {
    expect(testSkillActivation("add an info! call")).toContain(
      "rust-tracing-practices",
    );
  });

  it("activates Rust style guidance for Rust work", () => {
    expect(testSkillActivation("add a rust function")).toContain(
      "rust-coding-style",
    );
  });

  it("does not activate Rust style guidance for other languages", () => {
    expect(testSkillActivation("review this TypeScript enum")).not.toContain(
      "rust-coding-style",
    );
  });

  it("what is the weather today", ({ task }) => createSnapshot(task.name));
});
