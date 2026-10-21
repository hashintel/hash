/* eslint-disable no-console, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-assignment, typescript/no-unsafe-argument -- a Node CLI script that reports on the console; Node's types are outside the prototype's tsconfig */
// Checks for the Flows editor prototype: DS token discipline, then a type check of the prototype's own files.
// Run: `yarn check:flows-editor-prototype` (from libs/@hashintel/petrinaut). Prototype branch only.
//
// Token guard: no native date or time inputs; text and borders use the DS semantic tokens (neutral.fg.*, neutral.bd.*, blue.fg.*, …) and type uses
// DS text styles, never raw scale steps or arbitrary font sizes. A line may opt out with a trailing
// `// token-guard: allow <reason>`; the reason is required.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "src");

const rules = [
  {
    name: "raw neutral/blue scale colour",
    pattern: /\b(?:neutral|blue)\.s\d+\b|--colors-(?:neutral|blue)-s\d+/,
    fix: "use a semantic token: neutral.fg.heading/body/muted/subtle, neutral.bd.subtle/solid/strong, neutral.bgSolid.*, blue.fg.*, blue.bd.*",
  },
  {
    name: "arbitrary font size",
    pattern: /fontSize:\s*"\[\d+(?:\.\d+)?px\]"/,
    fix: 'use a DS text style: textStyle: "xxs" | "xs" | "sm" | "base" | "lg"',
  },
  {
    // 21 Oct: dates are picked (DS datePicker surface), times are picked (DS Select); never the browser's own box.
    name: "native date or time input",
    pattern: /type=\{?\s*["'](?:date|time|datetime-local|month|week)["']/,
    fix: "use TypedValue (DateField: DS datePicker surface) for a date, TimeField (DS Select) for a time",
  },
];

const files = readdirSync(src, { recursive: true })
  .map(String)
  .filter((file) => /\.(tsx?|mts)$/.test(file))
  .map((file) => join(src, file));

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const allowed = /\/\/ token-guard: allow \S/.test(line);
    for (const rule of rules) {
      if (rule.pattern.test(line) && !allowed) {
        problems.push(
          `${relative(here, file)}:${index + 1}  ${rule.name}: ${line.trim()}\n    → ${rule.fix}`,
        );
      }
    }
  });
}

if (problems.length > 0) {
  console.error(
    `Token guard: ${problems.length} problem(s)\n\n${problems.join("\n")}`,
  );
  process.exit(1);
}
console.log(`Token guard: ${files.length} files clean.`);

// Type check, reporting only the prototype's own files: the repo's unbuilt dependencies add unrelated errors.
let output = "";
try {
  output = execFileSync(
    process.execPath,
    [
      join(
        here,
        "../../../../node_modules/@typescript/native-preview/bin/tsgo.js",
      ),
      "--noEmit",
      "-p",
      join(here, "tsconfig.json"),
    ],
    { encoding: "utf8", stdio: "pipe", cwd: here },
  );
} catch (error) {
  output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}
const own = output
  .split(/\r?\n/)
  .filter(
    (line) =>
      /^(src|main\.tsx)/.test(line) && !line.startsWith("src/mock-graph.ts"),
  );
if (own.length > 0) {
  console.error(
    `Type check: ${own.length} error(s) in the prototype\n${own.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Type check: the prototype's own files are clean (mock-graph.ts waits on built @blockprotocol/type-system).",
);

// Task grading: the success predicates have their own tests (tasks.test.ts).
try {
  execFileSync(
    process.execPath,
    [
      join(here, "../../../../node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vite.config.ts",
      "src/tasks.test.ts",
    ],
    { encoding: "utf8", stdio: "pipe", cwd: here },
  );
  console.log("Task grading tests: pass.");
} catch (error) {
  console.error(
    `Task grading tests failed\n${error.stdout ?? ""}${error.stderr ?? ""}`,
  );
  process.exit(1);
}
