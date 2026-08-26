import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { contextRootPresent, REPO_ROOT } from "./workspace";

const CONTROL_ROOT = join(REPO_ROOT, "docs/control");
const STEERING_PATH = join(CONTROL_ROOT, "STEERING.md");
const STRATEGY_LOG_PATH = join(CONTROL_ROOT, "STRATEGY-LOG.md");
const REQUIRED_FIELDS = [
  "Date",
  "Trigger/evidence",
  "Decision",
  "Consequences/cuts",
  "Revisit when",
  "Supersedes",
  "Evidence links",
] as const;

interface StrategyEntry {
  readonly id: string;
  readonly fields: ReadonlyMap<string, string>;
}

const strategyEntries = (markdown: string): StrategyEntry[] =>
  [
    ...markdown.matchAll(
      /^### (S-\d{3})\n([\s\S]*?)(?=^### S-\d{3}\n|(?![\s\S]))/gm,
    ),
  ].map(([, id, body]) => ({
    id: id!,
    fields: new Map(
      [
        ...body!.matchAll(
          /^\*\*([^*]+):\*\*\s*([\s\S]*?)(?=^\*\*[^*]+:\*\*|(?![\s\S]))/gm,
        ),
      ].map(([, name, value]) => [name!, value!.trim()]),
    ),
  }));

/**
 * A strategy entry may supersede several earlier entries; the field lists them
 * comma-separated, or reads `none`.
 */
const supersededTargets = (field: string): string[] =>
  field === "none" ? [] : field.split(",").map((target) => target.trim());

describe.skipIf(!contextRootPresent)("strategic control surfaces", () => {
  const steering = readFileSync(STEERING_PATH, "utf8");
  const strategyLog = readFileSync(STRATEGY_LOG_PATH, "utf8");
  const entries = strategyEntries(strategyLog);

  test("has one current mutable strategic control and no coordination control", () => {
    expect(existsSync(STEERING_PATH)).toBe(true);
    expect(existsSync(join(CONTROL_ROOT, "COORDINATION.md"))).toBe(false);
    expect(steering).toContain("one mutable current strategic control");
  });

  test("strategy entries all parse with monotonically increasing unique IDs", () => {
    const entryArea = strategyLog.match(/^## Entries\n([\s\S]*)$/m);
    expect(entryArea).not.toBeNull();
    const entryHeadingCount = [...entryArea![1]!.matchAll(/^### .+$/gm)].length;
    expect(entries).toHaveLength(entryHeadingCount);
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
    const numbers = entries.map(({ id }) => Number(id.slice(2)));
    expect(numbers).toEqual([...numbers].sort((left, right) => left - right));
  });

  test("strategy entries have every required field", () => {
    for (const entry of entries) {
      expect([...entry.fields.keys()]).toEqual(REQUIRED_FIELDS);
      for (const value of entry.fields.values()) expect(value).not.toBe("");
    }
  });

  test("supersedes targets resolve backward without cycles", () => {
    const seen = new Set<string>();
    const invalidTargets: Array<{
      entry: string;
      target: string;
      reason: "malformed" | "not-earlier";
    }> = [];
    for (const entry of entries) {
      for (const target of supersededTargets(entry.fields.get("Supersedes")!)) {
        if (!/^S-\d{3}$/.test(target)) {
          invalidTargets.push({
            entry: entry.id,
            target,
            reason: "malformed",
          });
        }
        if (!seen.has(target)) {
          invalidTargets.push({
            entry: entry.id,
            target,
            reason: "not-earlier",
          });
        }
      }
      seen.add(entry.id);
    }
    expect(invalidTargets).toEqual([]);
  });

  test("every strategy ID in steering resolves and is unsuperseded", () => {
    const governingSection = steering.match(
      /^## Governing concerns\n([\s\S]*?)(?=^## |(?![\s\S]))/m,
    );
    expect(governingSection).not.toBeNull();
    expect(governingSection![1]).toMatch(/S-\d{3}/);
    const referencedIds = [...steering.matchAll(/S-\d{3}/g)].map(([id]) => id);
    const knownIds = new Set(entries.map(({ id }) => id));
    const supersededIds = new Set(
      entries.flatMap(({ fields }) =>
        supersededTargets(fields.get("Supersedes")!),
      ),
    );
    for (const id of referencedIds) {
      expect(knownIds.has(id)).toBe(true);
      expect(supersededIds.has(id)).toBe(false);
    }
  });
});
