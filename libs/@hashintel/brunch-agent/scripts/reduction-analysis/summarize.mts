/**
 * Merge knip and fallow JSON reports into one list tagged by the tool(s) that
 * reported each finding, plus the findings that are unused only under
 * `--production` (code that only tests reach).
 *
 * Usage: node --experimental-strip-types summarize.mts <report-directory>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scope = [
  "apps/brunch-agent/",
  "apps/petrinaut-website/",
  "libs/@hashintel/brunch-agent/",
];

const inScope = (path: string): boolean =>
  scope.some((prefix) => path.startsWith(prefix));

type Finding = `${string}\t${string}\t${string}`;

const finding = (kind: string, file: string, name: string): Finding =>
  `${kind}\t${file}\t${name}`;

interface FallowItem {
  readonly path: string;
  readonly export_name?: string;
  readonly member_name?: string;
  readonly specifier?: string;
  readonly package_name?: string;
}

interface FallowReport {
  readonly [key: string]: unknown;
  readonly unlisted_dependencies?: readonly {
    readonly package_name: string;
    readonly imported_from: readonly { readonly path: string }[];
  }[];
  readonly circular_dependencies?: readonly {
    readonly files: readonly string[];
  }[];
}

const fallowKinds: Readonly<Record<string, string>> = {
  unused_files: "file",
  unused_exports: "export",
  unused_types: "type",
  unused_enum_members: "enum-member",
  unused_class_members: "class-member",
  unresolved_imports: "unresolved",
  unused_dependencies: "dependency",
  unused_dev_dependencies: "dependency",
};

const fallowFindings = (path: string): Set<Finding> => {
  const report = JSON.parse(readFileSync(path, "utf8")) as FallowReport;
  const found = new Set<Finding>();
  for (const [key, kind] of Object.entries(fallowKinds)) {
    for (const item of (report[key] ?? []) as readonly FallowItem[]) {
      if (!inScope(item.path)) continue;
      const name =
        item.export_name ??
        item.member_name ??
        item.specifier ??
        item.package_name ??
        "";
      found.add(finding(kind, item.path, name));
    }
  }
  for (const item of report.unlisted_dependencies ?? []) {
    for (const location of item.imported_from) {
      if (inScope(location.path))
        found.add(finding("unlisted", location.path, item.package_name));
    }
  }
  for (const item of report.circular_dependencies ?? []) {
    const [first] = item.files;
    if (first !== undefined && item.files.some(inScope))
      found.add(finding("cycle", first, item.files.join(" -> ")));
  }
  return found;
};

interface KnipReport {
  readonly issues: readonly ({ readonly file: string } & Readonly<
    Record<string, unknown>
  >)[];
}

const knipKinds: Readonly<Record<string, string>> = {
  files: "file",
  exports: "export",
  nsExports: "export",
  types: "type",
  nsTypes: "type",
  enumMembers: "enum-member",
  dependencies: "dependency",
  devDependencies: "dependency",
  unlisted: "unlisted",
  unresolved: "unresolved",
  binaries: "binary",
  cycles: "cycle",
};

const knipFindings = (path: string): Set<Finding> => {
  const report = JSON.parse(readFileSync(path, "utf8")) as KnipReport;
  const found = new Set<Finding>();
  for (const issue of report.issues) {
    if (!inScope(issue.file)) continue;
    for (const [key, kind] of Object.entries(knipKinds)) {
      const items = issue[key];
      if (!Array.isArray(items)) continue;
      for (const item of items as readonly { readonly name?: string }[]) {
        found.add(
          finding(kind, issue.file, key === "files" ? "" : (item.name ?? "")),
        );
      }
    }
  }
  return found;
};

const difference = (
  left: ReadonlySet<Finding>,
  right: ReadonlySet<Finding>,
): Set<Finding> => new Set([...left].filter((entry) => !right.has(entry)));

const report = (
  title: string,
  byTool: Readonly<Record<"fallow" | "knip", ReadonlySet<Finding>>>,
): void => {
  const merged = new Map<Finding, string[]>();
  for (const [tool, findings] of Object.entries(byTool)) {
    for (const entry of findings) {
      merged.set(entry, [...(merged.get(entry) ?? []), tool]);
    }
  }
  process.stdout.write(`\n## ${title} (${merged.size})\n`);
  if (merged.size === 0) process.stdout.write("   (none)\n");
  for (const [entry, tools] of [...merged].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const [kind = "", file = "", name = ""] = entry.split("\t");
    const tag = tools.length === 2 ? "both" : (tools[0] ?? "");
    process.stdout.write(
      `   [${tag.padEnd(6)}] ${kind.padEnd(12)} ${file} ${name}`.trimEnd() +
        "\n",
    );
  }
};

const directory = process.argv[2];
if (directory === undefined) {
  throw new Error("Usage: summarize.mts <report-directory>");
}

const fallowDead = fallowFindings(join(directory, "fallow-dead.json"));
const fallowProduction = fallowFindings(join(directory, "fallow-prod.json"));
const knipDead = knipFindings(join(directory, "knip-dead.json"));
const knipProduction = knipFindings(join(directory, "knip-prod.json"));

report("Unused in the full graph", { fallow: fallowDead, knip: knipDead });
report(
  "Used only by tests (unused under --production, used in the full graph)",
  {
    fallow: difference(fallowProduction, fallowDead),
    knip: difference(knipProduction, knipDead),
  },
);
