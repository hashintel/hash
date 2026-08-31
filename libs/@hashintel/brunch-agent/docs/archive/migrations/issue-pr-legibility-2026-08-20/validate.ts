import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(PACKAGE_ROOT, "data");
const HASH_MANIFEST_PATH = join(DATA_ROOT, "source-record-hashes.json");
const EXPECTED_HASH_MANIFEST_SHA256 =
  "15ff2f72cd7e49a6d3d20f3a71ebbf6f583573f384700a68775f1a4390c31717";

const EXPECTED_FILE_HASHES = {
  "github-proposals.json":
    "5c77c007537c15357a2d482c51bc933bc61b7727a6982e8324851d007e55adcc",
  // The two raw source snapshots were captured minified; the hashintel/hash
  // assimilation ran the monorepo formatter over them, so their frozen hashes
  // are pinned to the pretty-printed bytes. Parse-identical to the originals,
  // and every record-level hash below still checks the content itself.
  "github-source.json":
    "ff209f957d17fb3c3049a3c19845b2c3f2310c88cda88d01712a2a3ab67c5113",
  "linear-canonical-target-hashes.json":
    "2368d1d7a6d63193b981757e713148f8c155fb29e3ae68c1c805a03b1e338b25",
  "linear-proposals-FE-1366.json":
    "2473f32ebe5a4ef59f11d910e1ccf57f9eb22df60a9de40440652509e61bc327",
  "linear-proposals-FE-1383.json":
    "80146357d942c89602a3bbe74a31efa2f2c47556988c10c37c291d2778ae9ea7",
  "linear-proposals-FE-1401.json":
    "acdc70da63e7d8d74bff8aa736aa903978c695134e9f828e23419d7f4fa3a3d8",
  "linear-proposals-FE-1406.json":
    "87324f17f294996c8dcf0fc9ba92c76c51554ee0f7c48082f404e966e7275fbf",
  "linear-source.json":
    "863ba1deb87718cf3ba3c2accf70ac11cbe7b51a479aff9d9f1bf2719f26f152",
} as const;

/**
 * The two snapshots' hashes at capture time, before the formatter ran.
 * `source-record-hashes.json` is frozen with these in its `generatedFrom`
 * block, so the manifest is rebuilt against them, not the current file bytes.
 */
const ORIGINAL_SOURCE_SNAPSHOT_HASHES = {
  "linear-source.json":
    "1a7200ac6a8fe466615c8d963ee29922e9e9d258e07411ce9edcdd400d10a808",
  "github-source.json":
    "2d00d591a91c349b81a645907825aab8640831e4682be164eb905900698ae6f5",
} as const;

const LINEAR_PROPOSAL_FILES = {
  "FE-1366": "linear-proposals-FE-1366.json",
  "FE-1383": "linear-proposals-FE-1383.json",
  "FE-1401": "linear-proposals-FE-1401.json",
  "FE-1406": "linear-proposals-FE-1406.json",
} as const;

const EXPECTED_LINEAR_COUNTS: Readonly<
  Record<keyof typeof LINEAR_PROPOSAL_FILES, number>
> = {
  "FE-1366": 14,
  "FE-1383": 19,
  "FE-1401": 4,
  "FE-1406": 1,
};

const EXCLUDED_LINEAR_ISSUES = [
  "FE-1328",
  "FE-1329",
  "FE-1330",
  "FE-1331",
  "FE-1333",
  "FE-1334",
] as const;

/**
 * The FE-1357 subtree's proposals were reviewed and applied like every other
 * subtree's, but their frozen snapshot (`linear-proposals-FE-1357.json`) was
 * removed from the repository after the migration: its issue-URL-adjacent
 * prose tripped the preflight scan that blocks merging any pull request
 * whose title names a ticket still referenced beside a task marker, for
 * every ticket from FE-1437 through FE-1441. The bytes remain in
 * git history and the canonical target hashes remain complete. What survives
 * here is each removed proposal's identifier and applied title, so coverage
 * and the GitHub title checks still account for the whole subtree. All 29
 * changed both title and body when applied.
 */
const REMOVED_LINEAR_PROPOSAL_TITLES: ReadonlyMap<string, string> = new Map([
  ["FE-1357", "Plan the September elicitation demo and plugin specification"],
  ["FE-1358", "Survey Petrinaut for the September integration"],
  ["FE-1359", "Decide whether voice changes the elicitor architecture"],
  ["FE-1360", "Derive elicitation guidance from published research"],
  ["FE-1361", "Measure the one-shot AI elicitation baseline"],
  ["FE-1362", "Decide the September demo architecture"],
  ["FE-1363", "Choose the demo use case and modelling criteria"],
  ["FE-1364", "Define the process-model elicitation representation"],
  ["FE-1382", "Compile the truck-fleet source dossier"],
  ["FE-1397", "Validate the generic IR against worked plugin payloads"],
  ["FE-1402", "Define and rehearse the elicitation completion contract"],
  ["FE-1403", "Assemble and test the CPS interview guidance"],
  ["FE-1404", "Run the third baseline with completion and interview guidance"],
  ["FE-1405", "Draft and test the CPS payload schemas"],
  ["FE-1407", "Catalogue elicitor failures that published measures miss"],
  ["FE-1423", "Require safe remote access to the elicitor server"],
  ["FE-1431", "Define declarative plugin authoring"],
  ["FE-1433", "Deliver the remote Petrinaut elicitor integration"],
  ["FE-1434", "Test whether Flue resumes batched client-tool results"],
  ["FE-1435", "Test whether the elicitor stream drives Petrinaut’s chat panel"],
  ["FE-1436", "Connect the elicitor to Petrinaut’s real chat panel"],
  ["FE-1437", "Move brunch-agent into hashintel/hash with its history"],
  ["FE-1438", "Build and repair Petrinaut nets through client tools"],
  ["FE-1439", "Keep elicitation sessions private and durable per browser"],
  ["FE-1440", "Ship the elicitor in demo.petrinaut.org’s chat panel"],
  ["FE-1441", "Deploy the elicitor server behind the remote-release checks"],
  ["FE-1442", "Show live captures and completion accounting in the demo"],
  ["FE-1448", "Let Petrinaut hosts render interactive chat tools"],
  [
    "FE-1449",
    "Prove a structured brunch question suspends and resumes in Petrinaut",
  ],
]);

const LINEAR_REVIEW_AGENT_NOTES_OPEN = "+++🏗️ Agent notes";
const LINEAR_CANONICAL_AGENT_NOTES_OPEN = "+++ 🏗️ Agent notes";
const LINEAR_AGENT_NOTES_CLOSE = "+++";
const GITHUB_AGENT_NOTES_OPEN = "<details><summary>🏗️ Agent notes</summary>";
const GITHUB_AGENT_NOTES_CLOSE = "</details>";

interface LinearIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
  readonly url: string;
  readonly updatedAt: string;
  readonly creator: {
    readonly name: string;
    readonly email: string;
  };
}

interface LinearSource {
  readonly data: {
    readonly issues: {
      readonly nodes: readonly LinearIssue[];
    };
  };
}

interface LinearProposal {
  readonly id: string;
  readonly identifier: string;
  readonly url: string;
  readonly sourceUpdatedAt: string;
  readonly sourceTitle: string;
  readonly sourceTitleSha256: string;
  readonly sourceDescriptionSha256: string;
  readonly proposedTitle: string;
  readonly proposedOuter: string;
  readonly innerRecord: string;
  readonly innerSha256: string;
  readonly proposedBody: string;
  readonly proposedBodySha256: string;
}

interface LinearProposalFile {
  readonly root:
    | string
    | {
        readonly identifier: string;
      };
  readonly issueCount: number;
  readonly issues: readonly LinearProposal[];
}

interface LinearCanonicalTarget {
  readonly identifier: string;
  readonly bodySha256: string;
  readonly outerReplacement?: {
    readonly from: string;
    readonly to: string;
  };
}

interface LinearCanonicalTargetFile {
  readonly format: "linear-canonical-fold-v1";
  readonly issues: readonly LinearCanonicalTarget[];
}

interface GithubPullRequest {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly author: {
    readonly login: string;
  };
}

interface GithubProposal {
  readonly number: number;
  readonly url: string;
  readonly linkedIssue: string;
  readonly sourceUpdatedAt: string;
  readonly sourceTitle: string;
  readonly sourceTitleSha256: string;
  readonly sourceBodySha256: string;
  readonly proposedTitle: string;
  readonly proposedOuter: string;
  readonly sourceInnerRecord: string;
  readonly sourceInnerSha256: string;
  readonly innerRecord: string;
  readonly innerSha256: string;
  readonly proposedBody: string;
  readonly proposedBodySha256: string;
  readonly bodyChanged: boolean;
  readonly titleChanged: boolean;
}

interface GithubProposalFile {
  readonly prCount: number;
  readonly prs: readonly GithubProposal[];
}

interface SourceRecordHashes {
  readonly generatedFrom: {
    readonly linearSourceSha256: string;
    readonly githubSourceSha256: string;
  };
  readonly linear: readonly {
    readonly identifier: string;
    readonly url: string;
    readonly updatedAt: string;
    readonly titleSha256: string;
    readonly bodySha256: string;
  }[];
  readonly github: readonly {
    readonly number: number;
    readonly url: string;
    readonly updatedAt: string;
    readonly titleSha256: string;
    readonly bodySha256: string;
  }[];
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(name: keyof typeof EXPECTED_FILE_HASHES): string {
  return sha256(readFileSync(join(DATA_ROOT, name)));
}

function bodyOf(issue: LinearIssue): string {
  return issue.description ?? "";
}

function linearCanonicalOuter(
  proposal: LinearProposal,
  target: LinearCanonicalTarget,
): string {
  const replacement = target.outerReplacement;
  if (!replacement) return proposal.proposedOuter;
  check(
    replacement.from !== replacement.to,
    `${proposal.identifier} has a no-op replacement`,
  );
  check(
    countOccurrences(proposal.proposedOuter, replacement.from) === 1,
    `${proposal.identifier} outer replacement source must occur exactly once`,
  );
  check(
    !proposal.proposedOuter.includes(replacement.to),
    `${proposal.identifier} outer replacement target is already present`,
  );
  return proposal.proposedOuter.replace(replacement.from, replacement.to);
}

function linearCanonicalBody(
  proposal: LinearProposal,
  target: LinearCanonicalTarget,
): string {
  const canonicalOuter = linearCanonicalOuter(proposal, target);
  const openSeparator = proposal.innerRecord.startsWith("\n") ? "" : "\n";
  const trailingNewlines = proposal.innerRecord.match(/\n*$/)?.[0].length ?? 0;
  const closeSeparator = "\n".repeat(Math.max(0, 2 - trailingNewlines));
  return `${canonicalOuter}\n\n${LINEAR_CANONICAL_AGENT_NOTES_OPEN}\n${openSeparator}${proposal.innerRecord}${closeSeparator}${LINEAR_AGENT_NOTES_CLOSE}`;
}

function countOccurrences(haystack: string, needle: string): number {
  check(needle.length > 0, "Cannot count an empty value");
  let count = 0;
  let offset = 0;
  while (true) {
    const found = haystack.indexOf(needle, offset);
    if (found === -1) return count;
    count += 1;
    offset = found + needle.length;
  }
}

function countStandaloneLine(body: string, line: string): number {
  return body.split("\n").filter((candidate) => candidate === line).length;
}

function checkUnique<T>(values: readonly T[], label: string): void {
  check(
    new Set(values).size === values.length,
    `${label} contains a duplicate`,
  );
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true }),
  );
}

function buildHashManifest(
  linearIssues: readonly LinearIssue[],
  githubPullRequests: readonly GithubPullRequest[],
): SourceRecordHashes {
  return {
    generatedFrom: {
      linearSourceSha256: ORIGINAL_SOURCE_SNAPSHOT_HASHES["linear-source.json"],
      githubSourceSha256: ORIGINAL_SOURCE_SNAPSHOT_HASHES["github-source.json"],
    },
    linear: [...linearIssues]
      .sort((left, right) =>
        left.identifier.localeCompare(right.identifier, "en", {
          numeric: true,
        }),
      )
      .map((issue) => ({
        identifier: issue.identifier,
        url: issue.url,
        updatedAt: issue.updatedAt,
        titleSha256: sha256(issue.title),
        bodySha256: sha256(bodyOf(issue)),
      })),
    github: [...githubPullRequests]
      .sort((left, right) => left.number - right.number)
      .map((pullRequest) => ({
        number: pullRequest.number,
        url: pullRequest.url,
        updatedAt: pullRequest.updatedAt,
        titleSha256: sha256(pullRequest.title),
        bodySha256: sha256(pullRequest.body),
      })),
  };
}

function serializeHashManifest(manifest: SourceRecordHashes): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function checkFrozenFiles(): void {
  for (const [name, expectedHash] of Object.entries(EXPECTED_FILE_HASHES) as [
    keyof typeof EXPECTED_FILE_HASHES,
    string,
  ][]) {
    check(
      fileSha256(name) === expectedHash,
      `${name} no longer matches its frozen SHA-256`,
    );
  }
}

function checkLinear(
  sourceIssues: readonly LinearIssue[],
  proposals: readonly LinearProposal[],
  canonicalTargetByIdentifier: ReadonlyMap<string, LinearCanonicalTarget>,
): Map<string, LinearProposal> {
  check(
    sourceIssues.length === 73,
    `Expected 73 Linear source issues, found ${sourceIssues.length}`,
  );
  check(
    proposals.length === 38,
    `Expected 38 live Linear proposals, found ${proposals.length}`,
  );
  checkUnique(
    sourceIssues.map((issue) => issue.identifier),
    "Linear source",
  );
  checkUnique(
    proposals.map((proposal) => proposal.identifier),
    "Linear proposals",
  );
  check(
    canonicalTargetByIdentifier.size === 67,
    `Expected 67 Linear canonical targets, found ${canonicalTargetByIdentifier.size}`,
  );
  check(
    JSON.stringify(
      sorted(
        [...canonicalTargetByIdentifier.values()]
          .filter((target) => target.outerReplacement)
          .map((target) => target.identifier),
      ),
    ) === JSON.stringify(["FE-1433", "FE-1440"]),
    "Linear outer replacements must be limited to the two bare-domain canonicalizations",
  );

  const sourceByIdentifier = new Map(
    sourceIssues.map((issue) => [issue.identifier, issue]),
  );
  const proposalByIdentifier = new Map(
    proposals.map((proposal) => [proposal.identifier, proposal]),
  );
  const excluded = new Set<string>(EXCLUDED_LINEAR_ISSUES);

  for (const identifier of excluded) {
    const issue = sourceByIdentifier.get(identifier);
    check(
      issue,
      `Excluded issue ${identifier} is absent from the source snapshot`,
    );
    check(
      issue.creator.email === "dm@hash.ai",
      `${identifier} is not authored by Dora Ma`,
    );
    check(
      !proposalByIdentifier.has(identifier),
      `${identifier} must not have a proposal`,
    );
  }

  for (const identifier of REMOVED_LINEAR_PROPOSAL_TITLES.keys()) {
    check(
      !proposalByIdentifier.has(identifier),
      `${identifier} has both a live proposal and a removed-snapshot record`,
    );
  }
  const expectedCandidates = sourceIssues
    .filter((issue) => !excluded.has(issue.identifier))
    .map((issue) => issue.identifier);
  check(
    JSON.stringify(
      sorted([
        ...proposalByIdentifier.keys(),
        ...REMOVED_LINEAR_PROPOSAL_TITLES.keys(),
      ]),
    ) === JSON.stringify(sorted(expectedCandidates)),
    "Live and removed Linear proposals do not exactly cover the non-Dora source issues",
  );
  for (const identifier of canonicalTargetByIdentifier.keys()) {
    check(
      proposalByIdentifier.has(identifier) ||
        REMOVED_LINEAR_PROPOSAL_TITLES.has(identifier),
      `Canonical target ${identifier} matches neither a live proposal nor a removed-snapshot record`,
    );
  }

  let titleChanges = 0;
  let bodyChanges = 0;
  for (const proposal of proposals) {
    const source = sourceByIdentifier.get(proposal.identifier);
    check(
      source,
      `${proposal.identifier} is absent from the Linear source snapshot`,
    );
    check(
      source.id === proposal.id,
      `${proposal.identifier} has a different Linear id`,
    );
    check(
      source.url === proposal.url,
      `${proposal.identifier} has a different Linear URL`,
    );
    check(
      source.creator.email === "ln@hash.ai",
      `${proposal.identifier} is not Lu-authored`,
    );
    check(
      source.updatedAt === proposal.sourceUpdatedAt,
      `${proposal.identifier} updatedAt drifted`,
    );
    check(
      source.title === proposal.sourceTitle,
      `${proposal.identifier} source title drifted`,
    );
    check(
      sha256(source.title) === proposal.sourceTitleSha256,
      `${proposal.identifier} source title hash is invalid`,
    );
    check(
      sha256(bodyOf(source)) === proposal.sourceDescriptionSha256,
      `${proposal.identifier} source body hash is invalid`,
    );
    check(
      sha256(proposal.innerRecord) === proposal.innerSha256,
      `${proposal.identifier} inner-record hash is invalid`,
    );
    check(
      countOccurrences(bodyOf(source), proposal.innerRecord) === 1,
      `${proposal.identifier} inner record is not preserved exactly once in its source body`,
    );
    check(
      countOccurrences(proposal.proposedBody, proposal.innerRecord) === 1,
      `${proposal.identifier} inner record is not preserved exactly once in its proposed body`,
    );
    check(
      sha256(proposal.proposedBody) === proposal.proposedBodySha256,
      `${proposal.identifier} proposed-body hash is invalid`,
    );
    check(
      countStandaloneLine(
        proposal.proposedBody,
        LINEAR_REVIEW_AGENT_NOTES_OPEN,
      ) === 1,
      `${proposal.identifier} must have one reviewed Agent notes opener`,
    );
    check(
      countStandaloneLine(proposal.proposedBody, LINEAR_AGENT_NOTES_CLOSE) ===
        1,
      `${proposal.identifier} must have one canonical Agent notes closer`,
    );
    check(
      proposal.proposedBody.startsWith(
        `${proposal.proposedOuter}\n\n${LINEAR_REVIEW_AGENT_NOTES_OPEN}\n`,
      ),
      `${proposal.identifier} proposed body does not reconstruct from its proposed outer`,
    );

    const canonicalTarget = canonicalTargetByIdentifier.get(
      proposal.identifier,
    );
    check(canonicalTarget, `${proposal.identifier} lacks a canonical target`);
    const canonicalOuter = linearCanonicalOuter(proposal, canonicalTarget);
    const canonicalBody = linearCanonicalBody(proposal, canonicalTarget);
    check(
      countOccurrences(canonicalBody, proposal.innerRecord) === 1,
      `${proposal.identifier} inner record is not preserved exactly once in its canonical body`,
    );
    check(
      countStandaloneLine(canonicalBody, LINEAR_CANONICAL_AGENT_NOTES_OPEN) ===
        1,
      `${proposal.identifier} canonical body must have one stored Agent notes opener`,
    );
    check(
      canonicalBody.startsWith(
        `${canonicalOuter}\n\n${LINEAR_CANONICAL_AGENT_NOTES_OPEN}\n\n`,
      ),
      `${proposal.identifier} canonical body does not reconstruct from its proposed outer`,
    );
    check(
      canonicalBody.endsWith(`\n\n${LINEAR_AGENT_NOTES_CLOSE}`),
      `${proposal.identifier} canonical body lacks the required closing separator`,
    );
    check(
      sha256(canonicalBody) === canonicalTarget.bodySha256,
      `${proposal.identifier} canonical target hash is invalid`,
    );
    if (source.title !== proposal.proposedTitle) titleChanges += 1;
    if (bodyOf(source) !== canonicalBody) bodyChanges += 1;
  }
  // 65 and 66 across all 67 proposals; the 29 removed-snapshot proposals all
  // changed both, leaving 36 and 37 among the live ones.
  check(
    titleChanges === 36,
    `Expected 36 live Linear title changes, found ${titleChanges}`,
  );
  check(
    bodyChanges === 37,
    `Expected 37 live Linear body changes, found ${bodyChanges}`,
  );

  return proposalByIdentifier;
}

function removeStandaloneGithubWrapper(sourceInner: string): string {
  return sourceInner
    .replace(`${GITHUB_AGENT_NOTES_OPEN}\n`, "")
    .replace(GITHUB_AGENT_NOTES_CLOSE, "");
}

function checkGithub(
  sourcePullRequests: readonly GithubPullRequest[],
  proposals: readonly GithubProposal[],
  linearProposals: ReadonlyMap<string, LinearProposal>,
): void {
  check(
    sourcePullRequests.length === 25,
    `Expected 25 GitHub source pull requests, found ${sourcePullRequests.length}`,
  );
  check(
    proposals.length === 25,
    `Expected 25 GitHub proposals, found ${proposals.length}`,
  );
  checkUnique(
    sourcePullRequests.map((pullRequest) => pullRequest.number),
    "GitHub source",
  );
  checkUnique(
    proposals.map((proposal) => proposal.number),
    "GitHub proposals",
  );

  const sourceByNumber = new Map(
    sourcePullRequests.map((pullRequest) => [pullRequest.number, pullRequest]),
  );
  let titleChanges = 0;
  let bodyChanges = 0;

  for (const proposal of proposals) {
    const source = sourceByNumber.get(proposal.number);
    check(
      source,
      `PR #${proposal.number} is absent from the GitHub source snapshot`,
    );
    check(
      source.url === proposal.url,
      `PR #${proposal.number} has a different GitHub URL`,
    );
    check(
      source.author.login === "lunelson",
      `PR #${proposal.number} is not Lu-authored`,
    );
    check(
      source.updatedAt === proposal.sourceUpdatedAt,
      `PR #${proposal.number} updatedAt drifted`,
    );
    check(
      source.title === proposal.sourceTitle,
      `PR #${proposal.number} source title drifted`,
    );
    check(
      sha256(source.title) === proposal.sourceTitleSha256,
      `PR #${proposal.number} source title hash is invalid`,
    );
    check(
      sha256(source.body) === proposal.sourceBodySha256,
      `PR #${proposal.number} source body hash is invalid`,
    );
    check(
      sha256(proposal.sourceInnerRecord) === proposal.sourceInnerSha256,
      `PR #${proposal.number} source inner-record hash is invalid`,
    );
    check(
      countOccurrences(source.body, proposal.sourceInnerRecord) === 1,
      `PR #${proposal.number} source inner record is not preserved in its source body`,
    );
    check(
      sha256(proposal.innerRecord) === proposal.innerSha256,
      `PR #${proposal.number} normalized inner-record hash is invalid`,
    );

    if (proposal.number === 23) {
      check(
        removeStandaloneGithubWrapper(proposal.sourceInnerRecord) ===
          proposal.innerRecord,
        "PR #23 normalization changed more than the nested standalone wrapper lines",
      );
    } else {
      check(
        proposal.sourceInnerRecord === proposal.innerRecord,
        `PR #${proposal.number} changed its authoritative inner record`,
      );
    }

    check(
      countOccurrences(proposal.proposedBody, proposal.innerRecord) === 1,
      `PR #${proposal.number} inner record is not preserved exactly once in its proposed body`,
    );
    check(
      sha256(proposal.proposedBody) === proposal.proposedBodySha256,
      `PR #${proposal.number} proposed-body hash is invalid`,
    );
    check(
      countStandaloneLine(proposal.proposedBody, GITHUB_AGENT_NOTES_OPEN) === 1,
      `PR #${proposal.number} must have one canonical Agent notes opener`,
    );
    check(
      countStandaloneLine(proposal.proposedBody, GITHUB_AGENT_NOTES_CLOSE) ===
        1,
      `PR #${proposal.number} must have one canonical Agent notes closer`,
    );
    check(
      proposal.proposedBody.startsWith(
        `${proposal.proposedOuter}\n\n${GITHUB_AGENT_NOTES_OPEN}\n`,
      ),
      `PR #${proposal.number} proposed body does not reconstruct from its proposed outer`,
    );

    const linkedTitle =
      linearProposals.get(proposal.linkedIssue)?.proposedTitle ??
      REMOVED_LINEAR_PROPOSAL_TITLES.get(proposal.linkedIssue);
    check(
      linkedTitle !== undefined,
      `PR #${proposal.number} links to missing proposal ${proposal.linkedIssue}`,
    );
    check(
      proposal.proposedTitle === `${proposal.linkedIssue}: ${linkedTitle}`,
      `PR #${proposal.number} title does not match its proposed Linear issue title`,
    );
    check(
      proposal.titleChanged ===
        (proposal.sourceTitle !== proposal.proposedTitle),
      `PR #${proposal.number} titleChanged is invalid`,
    );
    check(
      proposal.bodyChanged === (source.body !== proposal.proposedBody),
      `PR #${proposal.number} bodyChanged is invalid`,
    );
    if (proposal.titleChanged) titleChanges += 1;
    if (proposal.bodyChanged) bodyChanges += 1;
  }

  check(
    titleChanges === 24,
    `Expected 24 GitHub title changes, found ${titleChanges}`,
  );
  check(
    bodyChanges === 8,
    `Expected 8 GitHub body changes, found ${bodyChanges}`,
  );
}

function emitOriginals(
  destination: string,
  linearIssues: readonly LinearIssue[],
  githubPullRequests: readonly GithubPullRequest[],
): void {
  const writeExact = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: "wx" });
    check(
      readFileSync(path, "utf8") === content,
      `Rollback emission changed ${path}`,
    );
  };

  for (const issue of linearIssues) {
    const recordRoot = join(destination, "linear", issue.identifier);
    writeExact(join(recordRoot, "title.txt"), issue.title);
    writeExact(join(recordRoot, "body.md"), bodyOf(issue));
  }
  for (const pullRequest of githubPullRequests) {
    const recordRoot = join(destination, "github", String(pullRequest.number));
    writeExact(join(recordRoot, "title.txt"), pullRequest.title);
    writeExact(join(recordRoot, "body.md"), pullRequest.body);
  }
}

function main(): void {
  checkFrozenFiles();

  const linearSource = readJson<LinearSource>(
    join(DATA_ROOT, "linear-source.json"),
  );
  const githubSource = readJson<readonly GithubPullRequest[]>(
    join(DATA_ROOT, "github-source.json"),
  );
  const linearIssues = linearSource.data.issues.nodes;
  const linearCanonicalTargetFile = readJson<LinearCanonicalTargetFile>(
    join(DATA_ROOT, "linear-canonical-target-hashes.json"),
  );
  check(
    linearCanonicalTargetFile.format === "linear-canonical-fold-v1",
    "Linear canonical target manifest has an unknown format",
  );
  checkUnique(
    linearCanonicalTargetFile.issues.map((issue) => issue.identifier),
    "Linear canonical targets",
  );
  const linearCanonicalTargetByIdentifier = new Map(
    linearCanonicalTargetFile.issues.map((issue) => [issue.identifier, issue]),
  );

  const linearProposals: LinearProposal[] = [];
  for (const [root, name] of Object.entries(LINEAR_PROPOSAL_FILES) as [
    keyof typeof LINEAR_PROPOSAL_FILES,
    string,
  ][]) {
    const proposalFile = readJson<LinearProposalFile>(join(DATA_ROOT, name));
    const proposalRoot =
      typeof proposalFile.root === "string"
        ? proposalFile.root
        : proposalFile.root.identifier;
    check(
      proposalRoot === root,
      `${name} identifies root ${proposalRoot}, not ${root}`,
    );
    check(
      proposalFile.issueCount === EXPECTED_LINEAR_COUNTS[root],
      `${name} has an unexpected issueCount`,
    );
    check(
      proposalFile.issues.length === EXPECTED_LINEAR_COUNTS[root],
      `${name} has an unexpected number of proposals`,
    );
    linearProposals.push(...proposalFile.issues);
  }

  const linearProposalByIdentifier = checkLinear(
    linearIssues,
    linearProposals,
    linearCanonicalTargetByIdentifier,
  );
  const githubProposalFile = readJson<GithubProposalFile>(
    join(DATA_ROOT, "github-proposals.json"),
  );
  check(
    githubProposalFile.prCount === 25,
    "github-proposals.json has an unexpected prCount",
  );
  checkGithub(githubSource, githubProposalFile.prs, linearProposalByIdentifier);

  const expectedHashManifest = serializeHashManifest(
    buildHashManifest(linearIssues, githubSource),
  );
  const hashManifest = readFileSync(HASH_MANIFEST_PATH, "utf8");
  check(
    sha256(hashManifest) === EXPECTED_HASH_MANIFEST_SHA256,
    "source-record-hashes.json no longer matches its frozen SHA-256",
  );
  check(
    hashManifest === expectedHashManifest,
    "source-record-hashes.json does not match the frozen source snapshots",
  );

  if (process.argv[2] === "--emit-originals") {
    const destination = process.argv[3];
    check(
      destination && process.argv.length === 4,
      "Usage: node --experimental-strip-types validate.ts --emit-originals <dir>",
    );
    emitOriginals(destination, linearIssues, githubSource);
    console.log(
      `Emitted 73 Linear and 25 GitHub originals under ${destination}`,
    );
    return;
  }

  check(
    process.argv.length === 2,
    "Usage: node --experimental-strip-types validate.ts [--emit-originals <dir>]",
  );
  console.log(
    "Validated 73 Linear originals, 38 live + 29 removed-snapshot Linear proposals across 67 canonical targets, and 25 GitHub originals/proposals.",
  );
}

main();
