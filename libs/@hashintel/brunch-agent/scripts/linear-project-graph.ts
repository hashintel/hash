import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectIssue {
  readonly identifier: string;
  readonly title: string;
  readonly stateName: string;
  readonly parentIdentifier?: string;
  readonly assigneeName?: string;
  readonly assignedToViewer: boolean;
  readonly external: boolean;
}

export interface HardEdge {
  readonly from: string;
  readonly to: string;
}

export interface ProjectGraph {
  readonly projectName: string;
  readonly viewerName: string;
  readonly issues: readonly ProjectIssue[];
  readonly hardEdges: readonly HardEdge[];
}

interface LinearState {
  readonly name: string;
  readonly type: string;
}

interface LinearIssueRef {
  readonly identifier: string;
  readonly title: string;
  readonly state: LinearState;
  readonly project: { readonly name: string } | null;
  readonly assignee?: { readonly id: string; readonly name: string } | null;
}

interface LinearRelation {
  readonly type: string;
  readonly issue?: LinearIssueRef;
  readonly relatedIssue?: LinearIssueRef;
}

interface LinearIssueRecord extends LinearIssueRef {
  readonly parent: { readonly identifier: string } | null;
  readonly relations: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly LinearRelation[];
  };
  readonly inverseRelations: {
    readonly pageInfo: { readonly hasNextPage: boolean };
    readonly nodes: readonly LinearRelation[];
  };
}

interface ProjectIssuePage {
  readonly projectName: string;
  readonly viewer: { readonly id: string; readonly name: string };
  readonly issues: readonly LinearIssueRecord[];
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
}

const PROJECT_QUERY = `
query ProjectGraph($project: String!, $after: String) {
  viewer { id name }
  projects(filter: { name: { eq: $project } }, first: 2) {
    nodes {
      name
      issues(first: 25, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          identifier
          title
          state { name type }
          parent { identifier }
          project { name }
          assignee { id name }
          relations(first: 15) {
            pageInfo { hasNextPage }
            nodes {
              type
              relatedIssue {
                identifier
                title
                state { name type }
                project { name }
              }
            }
          }
          inverseRelations(first: 15) {
            pageInfo { hasNextPage }
            nodes {
              type
              issue {
                identifier
                title
                state { name type }
                project { name }
              }
            }
          }
        }
      }
    }
  }
}`;

const CLOSED_STATE_TYPES = new Set(["completed", "canceled", "duplicate"]);

const compareIdentifiers = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true });

const normalizedTitle = (title: string): string =>
  title.replaceAll("|", "/").replaceAll(/\s+/g, " ").trim();

const cycleMembers = (
  issueIds: readonly string[],
  outgoing: ReadonlyMap<string, readonly string[]>,
): Set<string> => {
  const cycleIds = new Set<string>();

  const reachesStart = (
    start: string,
    current: string,
    visited: Set<string>,
  ): boolean => {
    for (const next of outgoing.get(current) ?? []) {
      if (next === start) return true;
      if (visited.has(next)) continue;
      visited.add(next);
      if (reachesStart(start, next, visited)) return true;
    }
    return false;
  };

  for (const issueId of issueIds) {
    if (reachesStart(issueId, issueId, new Set([issueId])))
      cycleIds.add(issueId);
  }
  return cycleIds;
};

export function renderProjectGraph(graph: ProjectGraph): string {
  const issuesById = new Map(
    graph.issues.map((issue) => [issue.identifier, issue]),
  );
  const hardEdges = graph.hardEdges
    .filter((edge) => issuesById.has(edge.from) && issuesById.has(edge.to))
    .filter(
      (edge, index, edges) =>
        edges.findIndex(
          (candidate) =>
            candidate.from === edge.from && candidate.to === edge.to,
        ) === index,
    )
    .sort(
      (left, right) =>
        compareIdentifiers(left.from, right.from) ||
        compareIdentifiers(left.to, right.to),
    );
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(graph.issues.map((issue) => [issue.identifier, 0]));

  for (const edge of hardEdges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  for (const issueIds of [...incoming.values(), ...outgoing.values()]) {
    issueIds.sort(compareIdentifiers);
  }

  const layerById = new Map<string, number>();
  let frontier = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([issueId]) => issueId)
    .sort(compareIdentifiers);
  let layer = 0;

  while (frontier.length > 0) {
    const nextFrontier = new Set<string>();
    for (const issueId of frontier) {
      layerById.set(issueId, layer);
      for (const blockedId of outgoing.get(issueId) ?? []) {
        const remaining = (indegree.get(blockedId) ?? 0) - 1;
        indegree.set(blockedId, remaining);
        if (remaining === 0) nextFrontier.add(blockedId);
      }
    }
    frontier = [...nextFrontier].sort(compareIdentifiers);
    layer += 1;
  }

  const unlayeredIds = graph.issues
    .map((issue) => issue.identifier)
    .filter((issueId) => !layerById.has(issueId));
  const cycles = [...cycleMembers(unlayeredIds, outgoing)].sort(
    compareIdentifiers,
  );
  const externalCount = graph.issues.filter((issue) => issue.external).length;
  const projectIssueCount = graph.issues.length - externalCount;
  const assigneeMismatchCount = graph.issues.filter(
    (issue) => !issue.external && !issue.assignedToViewer,
  ).length;
  const header = [
    `project ${graph.projectName}`,
    `open=${projectIssueCount}`,
    `hard=${hardEdges.length}`,
    `assignee-mismatches=${assigneeMismatchCount}`,
    ...(externalCount > 0 ? [`external=${externalCount}`] : []),
  ].join(" ");
  const issueLines = [...graph.issues]
    .sort((left, right) => {
      const leftLayer =
        layerById.get(left.identifier) ?? Number.POSITIVE_INFINITY;
      const rightLayer =
        layerById.get(right.identifier) ?? Number.POSITIVE_INFINITY;
      return (
        leftLayer - rightLayer ||
        compareIdentifiers(left.identifier, right.identifier)
      );
    })
    .map((issue) => {
      const issueLayer = layerById.get(issue.identifier);
      const tags = [
        issue.stateName,
        issue.parentIdentifier ? `p:${issue.parentIdentifier}` : "root",
        ...(issue.external
          ? ["*"]
          : [
              issue.assignedToViewer
                ? "a:self"
                : `a:${issue.assigneeName ?? "unassigned"}`,
            ]),
      ].join(" ");
      const blockers = incoming.get(issue.identifier);
      const blocks = outgoing.get(issue.identifier);
      return [
        `L${issueLayer ?? "?"}`,
        issue.identifier,
        `[${tags}]`,
        ...(blockers?.length ? [`<=${blockers.join(",")}`] : []),
        ...(blocks?.length ? [`=>${blocks.join(",")}`] : []),
        "|",
        normalizedTitle(issue.title),
      ].join(" ");
    });

  return [
    header,
    `viewer: ${graph.viewerName}`,
    "legend: L=hard-dependency layer; p=parent; a=assignee; <=blocked by; =>blocks; *=outside project",
    ...issueLines,
    `cycles: ${cycles.length > 0 ? cycles.join(",") : "none"}`,
  ].join("\n");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLinearIssueRef = (value: unknown): value is LinearIssueRef =>
  isRecord(value) &&
  typeof value.identifier === "string" &&
  typeof value.title === "string" &&
  isRecord(value.state) &&
  typeof value.state.name === "string" &&
  typeof value.state.type === "string" &&
  (value.project === null ||
    (isRecord(value.project) && typeof value.project.name === "string")) &&
  (value.assignee === undefined ||
    value.assignee === null ||
    (isRecord(value.assignee) &&
      typeof value.assignee.id === "string" &&
      typeof value.assignee.name === "string"));

export const readProjectIssuePage = (value: unknown): ProjectIssuePage => {
  if (!isRecord(value))
    throw new Error("Linear returned a non-object response.");
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    const messages = value.errors
      .map((error) =>
        isRecord(error) && typeof error.message === "string"
          ? error.message
          : null,
      )
      .filter((message): message is string => message !== null);
    throw new Error(
      `Linear GraphQL refused the project query: ${messages.join("; ")}`,
    );
  }
  const data = value.data;
  const viewer = isRecord(data) ? data.viewer : undefined;
  if (
    !isRecord(viewer) ||
    typeof viewer.id !== "string" ||
    viewer.id.length === 0 ||
    typeof viewer.name !== "string" ||
    viewer.name.length === 0
  ) {
    throw new Error(
      "Linear returned a missing or malformed authenticated viewer (expected non-empty id and name).",
    );
  }
  const projects =
    isRecord(data) && isRecord(data.projects) ? data.projects.nodes : undefined;
  if (
    !Array.isArray(projects) ||
    projects.length !== 1 ||
    !isRecord(projects[0])
  ) {
    throw new Error(
      `Expected exactly one Linear project, received ${
        Array.isArray(projects) ? projects.length : 0
      }.`,
    );
  }
  const project = projects[0];
  const issuesConnection = project.issues;
  if (
    typeof project.name !== "string" ||
    !isRecord(issuesConnection) ||
    !Array.isArray(issuesConnection.nodes) ||
    !isRecord(issuesConnection.pageInfo) ||
    typeof issuesConnection.pageInfo.hasNextPage !== "boolean"
  ) {
    throw new Error("Linear returned an unexpected project issue shape.");
  }
  const issues = issuesConnection.nodes as readonly LinearIssueRecord[];
  for (const issue of issues) {
    if (
      !isRecord(issue) ||
      typeof issue.identifier !== "string" ||
      typeof issue.title !== "string" ||
      !isRecord(issue.state) ||
      typeof issue.state.name !== "string" ||
      typeof issue.state.type !== "string" ||
      (issue.assignee !== undefined &&
        issue.assignee !== null &&
        (!isRecord(issue.assignee) ||
          typeof issue.assignee.id !== "string" ||
          typeof issue.assignee.name !== "string")) ||
      !isRecord(issue.relations) ||
      !isRecord(issue.inverseRelations) ||
      !Array.isArray(issue.relations.nodes) ||
      !Array.isArray(issue.inverseRelations.nodes) ||
      !isRecord(issue.relations.pageInfo) ||
      typeof issue.relations.pageInfo.hasNextPage !== "boolean" ||
      !isRecord(issue.inverseRelations.pageInfo) ||
      typeof issue.inverseRelations.pageInfo.hasNextPage !== "boolean" ||
      (issue.parent !== null &&
        (!isRecord(issue.parent) ||
          typeof issue.parent.identifier !== "string"))
    ) {
      throw new Error("Linear returned an unexpected issue shape.");
    }
    for (const relation of issue.relations.nodes) {
      if (
        !isRecord(relation) ||
        typeof relation.type !== "string" ||
        (relation.relatedIssue !== null &&
          !isLinearIssueRef(relation.relatedIssue)) ||
        (relation.type === "blocks" && !isLinearIssueRef(relation.relatedIssue))
      ) {
        throw new Error(
          `Linear returned an unexpected relation shape for ${issue.identifier}.`,
        );
      }
    }
    for (const relation of issue.inverseRelations.nodes) {
      if (
        !isRecord(relation) ||
        typeof relation.type !== "string" ||
        (relation.issue !== null && !isLinearIssueRef(relation.issue)) ||
        (relation.type === "blocks" && !isLinearIssueRef(relation.issue))
      ) {
        throw new Error(
          `Linear returned an unexpected inverse relation shape for ${issue.identifier}.`,
        );
      }
    }
    if (
      issue.relations.pageInfo.hasNextPage ||
      issue.inverseRelations.pageInfo.hasNextPage
    ) {
      throw new Error(
        `${issue.identifier} has more than 15 relations; increase the relation page size before trusting this projection.`,
      );
    }
  }
  const endCursor = issuesConnection.pageInfo.endCursor;
  if (endCursor !== null && typeof endCursor !== "string") {
    throw new Error("Linear returned an invalid issue cursor.");
  }
  return {
    projectName: project.name,
    viewer: { id: viewer.id, name: viewer.name },
    issues,
    hasNextPage: issuesConnection.pageInfo.hasNextPage,
    endCursor,
  };
};

const queryProjectPage = (
  projectName: string,
  after: string | null,
): ProjectIssuePage => {
  const result = spawnSync(
    "linear",
    [
      "api",
      "--variables-json",
      JSON.stringify({ project: projectName, after }),
      PROJECT_QUERY,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`linear api failed: ${result.stderr.trim()}`);
  }
  let response: unknown;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw new Error("linear api returned invalid JSON.");
  }
  return readProjectIssuePage(response);
};

const asProjectIssue = (
  issue: LinearIssueRef,
  projectName: string,
  viewerId: string,
  parentIdentifier?: string,
): ProjectIssue => ({
  identifier: issue.identifier,
  title: issue.title,
  stateName: issue.state.name,
  ...(parentIdentifier ? { parentIdentifier } : {}),
  ...(issue.assignee ? { assigneeName: issue.assignee.name } : {}),
  assignedToViewer: issue.assignee?.id === viewerId,
  external: issue.project?.name !== projectName,
});

export const fetchProjectGraph = (
  projectName: string,
  includeClosed = false,
  queryPage: (
    projectName: string,
    after: string | null,
  ) => ProjectIssuePage = queryProjectPage,
): ProjectGraph => {
  const projectIssues = new Map<string, LinearIssueRecord>();
  let after: string | null = null;
  let resolvedProjectName = projectName;
  let viewer = { id: "", name: "unknown" };

  do {
    const page = queryPage(projectName, after);
    resolvedProjectName = page.projectName;
    viewer = page.viewer;
    for (const issue of page.issues) projectIssues.set(issue.identifier, issue);
    after = page.hasNextPage ? page.endCursor : null;
    if (page.hasNextPage && after === null) {
      throw new Error("Linear reported another issue page without a cursor.");
    }
  } while (after !== null);

  const selected = (issue: LinearIssueRef): boolean =>
    includeClosed || !CLOSED_STATE_TYPES.has(issue.state.type);
  const issues = new Map<string, ProjectIssue>();
  const hardEdges = new Map<string, HardEdge>();

  for (const issue of projectIssues.values()) {
    if (!selected(issue)) continue;
    issues.set(
      issue.identifier,
      asProjectIssue(
        issue,
        resolvedProjectName,
        viewer.id,
        issue.parent?.identifier,
      ),
    );

    for (const relation of issue.relations.nodes) {
      const relatedIssue = relation.relatedIssue;
      if (
        relation.type !== "blocks" ||
        !relatedIssue ||
        !selected(relatedIssue)
      )
        continue;
      issues.set(
        relatedIssue.identifier,
        issues.get(relatedIssue.identifier) ??
          asProjectIssue(relatedIssue, resolvedProjectName, viewer.id),
      );
      const edge = { from: issue.identifier, to: relatedIssue.identifier };
      hardEdges.set(`${edge.from}>${edge.to}`, edge);
    }
    for (const relation of issue.inverseRelations.nodes) {
      const sourceIssue = relation.issue;
      if (relation.type !== "blocks" || !sourceIssue || !selected(sourceIssue))
        continue;
      issues.set(
        sourceIssue.identifier,
        issues.get(sourceIssue.identifier) ??
          asProjectIssue(sourceIssue, resolvedProjectName, viewer.id),
      );
      const edge = { from: sourceIssue.identifier, to: issue.identifier };
      hardEdges.set(`${edge.from}>${edge.to}`, edge);
    }
  }

  return {
    projectName: resolvedProjectName,
    viewerName: viewer.name,
    issues: [...issues.values()],
    hardEdges: [...hardEdges.values()],
  };
};

const usage = `Usage: turbo run linear:graph --filter '@hashintel/brunch-agent' -- [--project <name>] [--all]

Print a compact, read-only hard-dependency projection for agent sequencing.
Defaults to open issues in the brunch-agent project. The output is factual input;
it does not infer priority, soft dependencies, or a sequencing recommendation.`;

export const parseArguments = (
  arguments_: readonly string[],
): {
  readonly projectName: string;
  readonly includeClosed: boolean;
  readonly help: boolean;
} => {
  let projectName = "brunch-agent";
  let includeClosed = false;
  let help = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--all") {
      includeClosed = true;
    } else if (argument === "--project") {
      const value = arguments_[index + 1];
      if (!value) throw new Error("Missing value after --project.");
      projectName = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument ?? ""}`);
    }
  }
  return { projectName, includeClosed, help };
};

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
    } else {
      console.log(
        renderProjectGraph(
          fetchProjectGraph(options.projectName, options.includeClosed),
        ),
      );
    }
  } catch (error) {
    console.error(
      `linear:graph: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      "Run `turbo run linear:graph --filter '@hashintel/brunch-agent' -- --help` for usage.",
    );
    process.exitCode = 1;
  }
}
