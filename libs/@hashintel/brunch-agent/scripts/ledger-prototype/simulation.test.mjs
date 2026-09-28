import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ledger } from "./ledger.mjs";

const cwd = dirname(fileURLToPath(import.meta.url));

test(
  "real SDK appends, competing supersessions, refusal/repair and role isolation (faux provider)",
  { timeout: 30_000 },
  () => {
    const output = execFileSync(
      process.execPath,
      ["simulate.mjs", "--synthetic"],
      { cwd, encoding: "utf8", timeout: 25_000 },
    );
    const directory = /^Run artifacts: (.+)$/m.exec(output)?.[1];
    assert.ok(directory, output);
    assert.match(output, /PERSONA \(opening\):/);
    assert.match(output, /ELICITOR:\nWhat horizon/);
    assert.match(output, /PERSONA:\nUse 104 weeks/);
    assert.equal(
      output.split("Use 104 weeks.").length - 1,
      1,
      "Do not print the persona reply again when submitting it.",
    );
    assert.doesNotMatch(
      output,
      /PRIVATE_REASONING_SENTINEL|Private to the simulated interviewee/,
    );
    assert.deepEqual(
      [...output.matchAll(/\[Ledger r(\d+) saved to ledger.md\]/g)].map(
        (match) => Number(match[1]),
      ),
      [1, 2, 3],
    );
    assert.ok(
      output.indexOf("[Ledger r1 saved") <
        output.indexOf("ELICITOR:\nWhat horizon"),
    );
    const json = (name) =>
      JSON.parse(readFileSync(join(directory, name), "utf8"));
    const rows = (name) =>
      readFileSync(join(directory, name), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
    assert.equal(json("outcome.json").state, "completed");
    const tools = rows("tools.jsonl");
    assert.deepEqual(
      tools.map(({ tool }) => tool),
      [
        "ledger_commit",
        "ledger_commit",
        "ledger_commit",
        "ledger_commit",
        "ledger_compile",
      ],
    );
    assert.equal(tools[0].result.details.status, "recorded");
    assert.equal(tools[1].result.details.code, "unknown-address");
    assert.equal(tools[1].result.details.currentRevision, 1);
    assert.equal(tools[2].result.details.revision, 2);
    assert.equal(tools[3].result.details.revision, 3);
    assert.equal(
      tools[2].result.details.notes[0].supersedes,
      tools[3].result.details.notes[0].supersedes,
    );
    const elicitor = rows("elicitor-requests.jsonl");
    const persona = rows("persona-requests.jsonl");
    const declarations = elicitor[0].messages[0].toolsAdded;
    assert.deepEqual(
      declarations.map(({ name }) => name),
      ["ledger_commit", "ledger_compile"],
    );
    const change = declarations[0].parameters.properties.changes.items;
    assert.deepEqual(change.required, ["op", "address", "content"]);
    assert.deepEqual(Object.keys(change.properties), [
      "op",
      "address",
      "content",
      "disposition",
    ]);
    assert.equal(change.additionalProperties, false);
    assert.equal(persona[0].messages[0].toolsAdded, undefined);
    assert.ok(
      JSON.stringify(persona[0]).includes(
        "Private to the simulated interviewee",
      ),
    );
    assert.ok(
      elicitor.every(
        (request) =>
          !JSON.stringify(request).includes(
            "Private to the simulated interviewee",
          ),
      ),
    );
    const delivered = persona[0].messages.filter(({ role }) => role === "user");
    assert.equal(delivered.length, 1);
    assert.ok(!JSON.stringify(delivered).includes("ledger_commit"));
    const cold = new Ledger(join(directory, "ledger.jsonl"));
    const compiled = cold.compile().markdown;
    assert.equal(readFileSync(join(directory, "ledger.md"), "utf8"), compiled);
    assert.match(compiled, /104 weeks is a modelling assumption/);
    assert.match(compiled, /An annual horizon might be useful/);
    assert.match(
      compiled,
      /A shorter first-year comparison may also be useful/,
    );
    assert.match(compiled, /\[n3 — supersedes n2; direct\]/);
    assert.match(compiled, /\[n4 — supersedes n2; inferred; unresolved\]/);
    assert.doesNotMatch(compiled, /Must not be recorded/);
    assert.doesNotMatch(
      cold.compile({ revision: 1 }).markdown,
      /104 weeks is a modelling assumption/,
    );
    const commits = rows("ledger.jsonl").slice(1);
    assert.equal(commits[1].inputId, "u2");
    assert.equal(commits[1].invocationId, "commit-2");
    assert.equal(commits[0].sessionId, commits[1].sessionId);
    assert.ok(!Object.hasOwn(commits[1].notes[0], "sourceIds"));
    assert.ok(!JSON.stringify(elicitor[0]).includes("[message u1]"));
  },
);
