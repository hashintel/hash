import path from "node:path";

import {
  allDependencies,
  importedPackages,
  MODEL_KEY_NAME,
  packageOf,
  runtimeDependencies,
  sourceFiles,
  testFiles,
  workspacePackages,
  type WorkspacePackage,
} from "./check-brunch-architecture/workspace";
import { UserFriendlyError } from "./shared/errors";

const corePackageName = "@hashintel/brunch-agent";
const substrateScopes = ["@flue/", "@earendil-works/"];
const flueRuntime = "@flue/runtime";

const otherSchemaLibraries = [
  "zod",
  "yup",
  "joi",
  "ajv",
  "superstruct",
  "arktype",
  "io-ts",
  "runtypes",
  "@sinclair/typebox",
  "@standard-schema/spec",
  "@standard-schema/utils",
];

const substrateIntegrationEntryPoints: Readonly<Record<string, string>> = {
  "libs/@hashintel/brunch-agent/packages/core/test/question-marker.test.ts":
    "Types the Flue logger and calls the core marker tool with a mocked data-part writer and logger; no runtime boot, provider, key or socket.",
  "apps/brunch-agent/test/brunch-turn.test.ts":
    "Types Flue's client, admission, and conversation snapshot and constructs FlueExecutionError so the persona bridge can be unit-tested against a stubbed client — no provider key, no socket, no model call, no runtime boot.",
  "apps/brunch-agent/test/flue-transcript.test.ts":
    "Types Flue's public conversation snapshot so the transcript projector can be unit-tested; the import is type-only — no provider key, no socket, no model call, no runtime boot.",
  "apps/brunch-agent/test/petrinaut-chat.integration.ts":
    "Boots the plain Flue chat agent on Flue's node runtime with pi-ai's faux provider, drives the browser ChatTransport against the mounted Flue route over app.fetch, and proves streamed reasoning/text, server tools, client-tool resume, SDK history ownership, SQLite restart, and harness-side idempotent apply-sweep — no provider key, no socket, no extraction model call. Run as a child process by petrinaut-chat.test.ts.",
  "apps/brunch-agent/test/prepared-workpiece.integration.ts":
    "Boots the built Flue ChatAgent with pi-ai's faux provider, creates a prepared fixture through one tagged public signal with fixture-scoped initial data, retries its deterministic idempotency key, and proves prepared/model workpiece selection from canonical history — no provider key, socket, or network model call.",
  "apps/brunch-agent/test/proof-artifacts.test.ts":
    "Types Flue's public conversation snapshot so canonical trace derivation, workpiece binding, and atomic evidence retention can be unit-tested against an in-memory fixture — no provider key, no socket, no model call, no runtime boot.",
  "apps/brunch-agent/test/runbook-artifacts.test.ts":
    "Types Flue's public conversation snapshot so runbook artifact recovery can be unit-tested; the import is type-only — no provider key, no socket, no model call, no runtime boot.",
  "apps/brunch-agent/test/runbook-elicitation-faux-provider.ts":
    "Defines the scripted pi-ai faux provider loaded only by the hermetic prospective-runner test — no provider key, no socket, and no network model call.",
  "apps/brunch-agent/test/runbook-headless.integration.ts":
    "Boots the built Flue ChatAgent with pi-ai's faux provider and a headless Petrinaut client to prove validated construct-only tool flow without a provider key, socket, or network model call.",
  "apps/brunch-agent/test/telemetry.test.ts":
    "Constructs Flue's content-free OpenTelemetry instrumentation with an injected exporter setup to prove disposal order; it registers no global instrumentation, opens no socket, and makes no provider call.",
  "apps/brunch-agent/test/workpiece.test.ts":
    "Types Flue's public conversation snapshot so the substrate-neutral workpiece selector and app-owned SHA-256 projection can be unit-tested against in-memory messages — no provider key, no socket, no model call, no runtime boot.",
  "libs/@hashintel/brunch-agent/packages/transport-aisdk/test/chat-transport.test.ts":
    "Types a stubbed public Flue client and stream chunks to prove finite AI SDK projection and client-tool signal admission — no runtime boot, provider key, socket, or model call.",
  "libs/@hashintel/brunch-agent/packages/transport-aisdk/test/transcript.test.ts":
    "Types Flue's public conversation snapshot so history can be projected into AI SDK messages without a runtime boot, provider key, socket, or model call.",
  "libs/@hashintel/brunch-agent/packages/transport-aisdk/test/ui-stream.test.ts":
    "Types Flue conversation-stream chunks so the finite AI SDK projector can be unit-tested without a runtime boot, provider key, socket, or model call.",
};

const isSubstrate = (name: string): boolean =>
  substrateScopes.some((scope) => name.startsWith(scope));

const byRole = (
  packages: readonly WorkspacePackage[],
  role: string,
): WorkspacePackage[] =>
  packages.filter((workspacePackage) =>
    workspacePackage.dir.startsWith(`${role}-`),
  );

const valuesEqual = (actual: unknown, expected: unknown): boolean =>
  JSON.stringify(actual) === JSON.stringify(expected);

const checkBrunchArchitecture = (): string[] => {
  const packages = workspacePackages();
  const violations: string[] = [];

  const assertCondition = (
    condition: boolean,
    rule: string,
    details: string,
  ): void => {
    if (!condition) {
      violations.push(`${rule}: ${details}`);
    }
  };

  const assertEqual = (
    actual: unknown,
    expected: unknown,
    rule: string,
    subject: string,
  ): void => {
    assertCondition(
      valuesEqual(actual, expected),
      rule,
      `${subject}; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  };

  for (const workspacePackage of packages) {
    assertCondition(
      sourceFiles(workspacePackage).length > 0,
      "complete scan",
      `${workspacePackage.relPath} has no scanned source files`,
    );
  }

  for (const workspacePackage of packages.filter(
    ({ kind }) => kind === "package",
  )) {
    assertCondition(
      /^(core|plugin-[a-z0-9-]+|binding-[a-z0-9-]+|transport-[a-z0-9-]+)$/.test(
        workspacePackage.dir,
      ),
      "role prefix",
      `${workspacePackage.relPath} is not core or a role-prefixed package`,
    );
  }

  for (const workspacePackage of packages) {
    assertCondition(
      !/^(adapter|wrapper|elicit)-/.test(workspacePackage.dir),
      "role vocabulary",
      `${workspacePackage.relPath} uses an avoided role noun`,
    );

    const expectedName =
      workspacePackage.kind === "app"
        ? "@apps/brunch-agent"
        : workspacePackage.dir === "core"
          ? corePackageName
          : `@hashintel/brunch-agent-${workspacePackage.dir}`;
    assertEqual(
      workspacePackage.name,
      expectedName,
      "workspace identity",
      workspacePackage.relPath,
    );
  }

  const core = packages.find(({ name }) => name === corePackageName);
  assertCondition(
    core !== undefined,
    "core workspace",
    `${corePackageName} is missing`,
  );

  if (core !== undefined) {
    assertEqual(
      allDependencies(core).filter(isSubstrate),
      [flueRuntime],
      "core runtime",
      "agent-runtime dependencies",
    );

    for (const file of sourceFiles(core)) {
      const substrateImports = importedPackages(file).filter((specifier) =>
        isSubstrate(packageOf(specifier)),
      );
      const expectedImports =
        file.relPath.endsWith("/src/flue.ts") ||
        file.relPath.endsWith("/src/skills/skill-markdown.ts")
          ? [flueRuntime]
          : [];
      assertEqual(
        substrateImports,
        expectedImports,
        "core runtime",
        file.relPath,
      );
    }

    for (const dependency of runtimeDependencies(core)) {
      assertCondition(
        !/^@hashintel\/brunch-agent-(binding|plugin)-/u.test(dependency),
        "core direction",
        `${core.relPath} depends on ${dependency}`,
      );
    }

    assertEqual(
      Object.keys(core.manifest.exports ?? {}),
      [
        ".",
        "./client-tools",
        "./flue",
        "./question-marker",
        "./storage",
        "./workpiece",
      ],
      "core exports",
      core.relPath,
    );
  }

  const plugins = byRole(packages, "plugin");
  assertCondition(
    plugins.length > 0,
    "plugin inventory",
    "no plugins were found",
  );
  for (const plugin of plugins) {
    const workspaceDependencies = runtimeDependencies(plugin).filter(
      (dependency) => dependency.startsWith(corePackageName),
    );
    assertEqual(
      workspaceDependencies,
      [corePackageName],
      "plugin direction",
      plugin.relPath,
    );
    assertEqual(
      allDependencies(plugin).filter(
        (dependency) => isSubstrate(dependency) && dependency !== flueRuntime,
      ),
      [],
      "plugin substrate",
      plugin.relPath,
    );

    for (const file of sourceFiles(plugin)) {
      for (const specifier of importedPackages(file)) {
        const importedPackage = packageOf(specifier);
        assertCondition(
          !isSubstrate(importedPackage) || importedPackage === flueRuntime,
          "plugin substrate",
          `${file.relPath} imports ${specifier}`,
        );
        assertCondition(
          !importedPackage.startsWith(corePackageName) ||
            importedPackage === corePackageName,
          "plugin direction",
          `${file.relPath} imports ${specifier}`,
        );
        assertCondition(
          specifier !== `${corePackageName}/storage`,
          "plugin storage lane",
          `${file.relPath} imports ${specifier}`,
        );
      }
    }
  }

  const bindings = byRole(packages, "binding");
  assertCondition(
    bindings.length > 0,
    "binding inventory",
    "no bindings were found",
  );
  for (const binding of bindings) {
    const dependencies = runtimeDependencies(binding);
    assertCondition(
      dependencies.includes(corePackageName),
      "binding direction",
      `${binding.relPath} does not depend on ${corePackageName}`,
    );
    assertCondition(
      dependencies.some(isSubstrate),
      "binding direction",
      `${binding.relPath} does not depend on a substrate`,
    );
    for (const dependency of dependencies) {
      assertCondition(
        !dependency.startsWith("@hashintel/brunch-agent-plugin-"),
        "binding direction",
        `${binding.relPath} depends on plugin ${dependency}`,
      );
    }
  }

  const transports = byRole(packages, "transport");
  assertCondition(
    transports.length > 0,
    "transport inventory",
    "no transports were found",
  );
  for (const transport of transports) {
    assertEqual(
      runtimeDependencies(transport).sort(),
      ["@flue/sdk", "ai"],
      "transport dependencies",
      transport.relPath,
    );
    for (const file of sourceFiles(transport).filter((sourceFile) =>
      sourceFile.path.startsWith(path.join(transport.path, "src")),
    )) {
      for (const specifier of importedPackages(file)) {
        if (!specifier.startsWith("node:")) {
          assertCondition(
            ["@flue/sdk", "ai"].includes(packageOf(specifier)),
            "transport imports",
            `${file.relPath} imports ${specifier}`,
          );
        }
      }
    }
  }

  for (const workspacePackage of packages) {
    const declared = runtimeDependencies(workspacePackage);
    for (const file of sourceFiles(workspacePackage)) {
      const importedWorkspaces = importedPackages(file)
        .map(packageOf)
        .filter(
          (imported) =>
            imported === corePackageName ||
            imported.startsWith(`${corePackageName}-`),
        );
      for (const imported of importedWorkspaces) {
        assertCondition(
          declared.includes(imported),
          "declared runtime dependency",
          `${file.relPath} imports undeclared workspace ${imported}`,
        );
      }
    }
  }

  for (const workspacePackage of packages) {
    const dependencies = allDependencies(workspacePackage);
    for (const forbidden of otherSchemaLibraries) {
      assertCondition(
        !dependencies.includes(forbidden),
        "schema library",
        `${workspacePackage.relPath} declares ${forbidden}`,
      );
    }

    const files = sourceFiles(workspacePackage);
    for (const file of files) {
      for (const specifier of importedPackages(file)) {
        assertCondition(
          !otherSchemaLibraries.includes(packageOf(specifier)),
          "schema library",
          `${file.relPath} imports ${specifier}`,
        );
      }
    }

    const importsValibot = files.some((file) =>
      importedPackages(file).some(
        (specifier) => packageOf(specifier) === "valibot",
      ),
    );
    const declaresValibot = dependencies.includes("valibot");
    assertEqual(
      declaresValibot,
      importsValibot,
      "valibot declaration",
      workspacePackage.relPath,
    );
  }

  const viteRanges = packages.flatMap((workspacePackage) => {
    const range =
      workspacePackage.manifest.devDependencies?.vite ??
      workspacePackage.manifest.dependencies?.vite;
    return range === undefined ? [] : [range];
  });
  assertCondition(
    viteRanges.length > 0,
    "Vite constraint",
    "no Vite range was found",
  );
  for (const range of viteRanges) {
    assertCondition(
      /^\^?8(\.|$)/u.test(range),
      "Vite constraint",
      `expected Vite 8, received ${range}`,
    );
  }

  for (const workspacePackage of packages) {
    for (const file of [
      ...sourceFiles(workspacePackage),
      ...testFiles(workspacePackage),
    ]) {
      assertCondition(
        !importedPackages(file).includes("@flue/runtime/bun"),
        "Flue runtime adapter",
        `${file.relPath} imports @flue/runtime/bun`,
      );
    }
  }

  for (const workspacePackage of packages.filter(
    ({ dir }) => !dir.startsWith("binding-"),
  )) {
    for (const file of sourceFiles(workspacePackage)) {
      assertCondition(
        !importedPackages(file).includes(`${corePackageName}/storage`),
        "core storage lane",
        `${file.relPath} imports ${corePackageName}/storage`,
      );
    }
  }

  for (const workspacePackage of packages) {
    assertCondition(
      typeof workspacePackage.manifest.scripts?.["lint:eslint"] === "string",
      "workspace tasks",
      `${workspacePackage.relPath} has no lint:eslint script`,
    );
    assertCondition(
      typeof workspacePackage.manifest.scripts?.["lint:tsc"] === "string",
      "workspace tasks",
      `${workspacePackage.relPath} has no lint:tsc script`,
    );
    assertCondition(
      workspacePackage.manifest.scripts?.["test:unit"]?.includes(
        "vitest run",
      ) === true,
      "workspace tasks",
      `${workspacePackage.relPath} test:unit does not run Vitest`,
    );
  }

  const suite = packages.flatMap((workspacePackage) =>
    testFiles(workspacePackage),
  );
  assertCondition(
    suite.length > 0,
    "test inventory",
    "no test files were found",
  );
  const modelKey = new RegExp(MODEL_KEY_NAME, "gu");
  for (const file of suite) {
    const keys = file.text.match(modelKey) ?? [];
    assertEqual(keys, [], "model credential", file.relPath);
  }

  const substrateImporters = suite
    .filter((file) =>
      importedPackages(file).some((specifier) =>
        isSubstrate(packageOf(specifier)),
      ),
    )
    .map(({ relPath }) => relPath)
    .sort();
  assertEqual(
    substrateImporters,
    Object.keys(substrateIntegrationEntryPoints).sort(),
    "hermetic substrate inventory",
    "reviewed test entry points",
  );

  for (const [filePath, review] of Object.entries(
    substrateIntegrationEntryPoints,
  )) {
    assertCondition(
      review.trim().length > 0,
      "hermetic substrate inventory",
      `${filePath} has no review rationale`,
    );
  }

  return violations;
};

const violations = checkBrunchArchitecture();

if (violations.length > 0) {
  throw new UserFriendlyError(
    `Brunch architecture check failed:\n${violations
      .map((violation) => `- ${violation}`)
      .join("\n")}`,
  );
}

console.log("Brunch architecture checks passed.");
