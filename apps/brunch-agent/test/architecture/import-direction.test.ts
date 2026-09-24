import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cruise,
  type ICruiseResult,
  type IDependency,
  type IModule,
} from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const appRoot = "apps/brunch-agent";
const packagesRoot = "libs/@hashintel/brunch-agent/packages";

const packageSourceRoots = readdirSync(`${repoRoot}/${packagesRoot}`, {
  withFileTypes: true,
}).flatMap((entry) => {
  if (!entry.isDirectory()) {
    return [];
  }

  return ["src", "test"]
    .map((directory) => `${packagesRoot}/${entry.name}/${directory}`)
    .filter((directory) => existsSync(`${repoRoot}/${directory}`));
});

const appConfigFiles = readdirSync(`${repoRoot}/${appRoot}`)
  .filter((fileName) => fileName.endsWith(".config.ts"))
  .map((fileName) => `${appRoot}/${fileName}`);

const sourceRoots = [
  `${appRoot}/src`,
  `${appRoot}/test`,
  ...appConfigFiles,
  ...packageSourceRoots,
];

interface PackageManifest {
  readonly name: string;
  readonly exports?: Readonly<
    Record<string, { readonly types?: string } | string>
  >;
}

interface PackageAlias {
  readonly alias: string;
  readonly name: string;
  readonly onlyModule: true;
}

const packageAliases = readdirSync(`${repoRoot}/${packagesRoot}`, {
  withFileTypes: true,
}).flatMap((entry): PackageAlias[] => {
  if (!entry.isDirectory()) {
    return [];
  }

  const packageRoot = join(repoRoot, packagesRoot, entry.name);
  const manifestPath = join(packageRoot, "package.json");
  if (!existsSync(manifestPath)) {
    return [];
  }

  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as PackageManifest;

  return Object.entries(manifest.exports ?? {}).flatMap(
    ([subpath, target]): PackageAlias[] => {
      const typesPath = typeof target === "string" ? target : target.types;
      if (typesPath === undefined) {
        return [];
      }

      return [
        {
          alias: join(packageRoot, typesPath),
          name:
            subpath === "."
              ? manifest.name
              : `${manifest.name}${subpath.slice(1)}`,
          onlyModule: true,
        },
      ];
    },
  );
});

interface ImportEdge {
  readonly source: string;
  readonly dependency: Pick<
    IDependency,
    "couldNotResolve" | "module" | "resolved"
  >;
}

const importEdgesFrom = (modules: readonly IModule[]): ImportEdge[] =>
  modules.flatMap((module) =>
    module.dependencies.map((dependency) => ({
      source: module.source,
      dependency,
    })),
  );

const importEdge = (
  source: string,
  module: string,
  resolved: string,
  couldNotResolve = false,
): ImportEdge => ({
  source,
  dependency: { couldNotResolve, module, resolved },
});

const brunchPackageFrom = (modulePath: string): string | undefined => {
  const pathMatch = /libs\/@hashintel\/brunch-agent\/packages\/([^/]+)\//u.exec(
    modulePath,
  );
  if (pathMatch?.[1] !== undefined) {
    return pathMatch[1];
  }

  if (
    modulePath === "@hashintel/brunch-agent" ||
    modulePath.startsWith("@hashintel/brunch-agent/")
  ) {
    return "core";
  }

  return /^@hashintel\/brunch-agent-([^/]+)(?:\/|$)/u.exec(modulePath)?.[1];
};

const targetsOf = ({ dependency }: ImportEdge): readonly string[] => [
  dependency.module,
  dependency.resolved,
];

const describeEdge = (edge: ImportEdge): string =>
  `${edge.source} -> ${edge.dependency.module} (${edge.dependency.resolved})`;

const someTarget = (
  edge: ImportEdge,
  predicate: (target: string) => boolean,
): boolean => targetsOf(edge).some(predicate);

const isSourceModule = (modulePath: string): boolean =>
  modulePath.startsWith(`${appRoot}/src/`) ||
  /^libs\/@hashintel\/brunch-agent\/packages\/[^/]+\/src\//u.test(modulePath);

const isTestModule = (modulePath: string): boolean =>
  modulePath.startsWith(`${appRoot}/test/`) ||
  /^libs\/@hashintel\/brunch-agent\/packages\/[^/]+\/test\//u.test(modulePath);

const isAppModule = (modulePath: string): boolean =>
  modulePath.startsWith("apps/") || modulePath.startsWith("@apps/");

const isInternalSpecifier = (modulePath: string): boolean =>
  modulePath.startsWith(".") ||
  modulePath === "@hashintel/brunch-agent" ||
  modulePath.startsWith("@hashintel/brunch-agent-") ||
  modulePath.startsWith("@hashintel/brunch-agent/") ||
  modulePath.startsWith("@apps/");

const violationsFrom = (edges: readonly ImportEdge[]): string[] =>
  edges.flatMap((edge) => {
    const sourcePackage = brunchPackageFrom(edge.source);
    const targetPackage = targetsOf(edge)
      .map(brunchPackageFrom)
      .find((packageName) => packageName !== undefined);
    const reasons: string[] = [];

    if (edge.source.startsWith("libs/") && someTarget(edge, isAppModule)) {
      reasons.push("library imports application");
    }
    if (
      edge.source.startsWith(`${appRoot}/`) &&
      someTarget(
        edge,
        (target) =>
          target.startsWith("apps/petrinaut-website/") ||
          target.startsWith("@apps/petrinaut-website"),
      )
    ) {
      reasons.push("Brunch app imports Petrinaut website source");
    }
    if (
      sourcePackage === "core" &&
      targetPackage !== undefined &&
      targetPackage !== "core"
    ) {
      reasons.push("core imports a sibling Brunch package");
    }
    if (
      sourcePackage !== undefined &&
      sourcePackage !== "core" &&
      targetPackage !== undefined &&
      targetPackage !== sourcePackage &&
      targetPackage !== "core"
    ) {
      reasons.push("Brunch extension imports a sibling extension");
    }
    if (isSourceModule(edge.source) && someTarget(edge, isTestModule)) {
      reasons.push("production source imports test code");
    }
    if (
      edge.dependency.couldNotResolve &&
      isInternalSpecifier(edge.dependency.module)
    ) {
      reasons.push("internal import could not be resolved");
    }

    return reasons.map((reason) => `${reason}: ${describeEdge(edge)}`);
  });

const cruiseModules = async (): Promise<readonly IModule[]> => {
  const result = await cruise(
    sourceRoots,
    {
      baseDir: repoRoot,
      doNotFollow: "node_modules",
      moduleSystems: ["es6"],
      tsPreCompilationDeps: true,
    },
    {
      alias: packageAliases,
      conditionNames: ["types", "import", "default"],
      extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs"],
    },
    { tsConfig: extractTSConfig(`${repoRoot}/${appRoot}/tsconfig.json`) },
  );

  if (typeof result.output === "string") {
    throw new TypeError("dependency-cruiser returned formatted output");
  }

  return (result.output as ICruiseResult).modules;
};

describe("Brunch import direction", () => {
  test.each([
    {
      rule: "library imports application",
      edge: importEdge(
        `${packagesRoot}/plugin-dafny/src/index.ts`,
        "../../../../../../apps/brunch-agent/src/db-path.ts",
        `${appRoot}/src/db-path.ts`,
      ),
    },
    {
      rule: "Brunch app imports Petrinaut website source",
      edge: importEdge(
        `${appRoot}/src/app.ts`,
        "../../petrinaut-website/src/voice-diagnostics.ts",
        "apps/petrinaut-website/src/voice-diagnostics.ts",
      ),
    },
    {
      rule: "core imports a sibling Brunch package",
      edge: importEdge(
        `${packagesRoot}/core/src/index.ts`,
        "@hashintel/brunch-agent-plugin-gherkin",
        `${packagesRoot}/plugin-gherkin/src/index.ts`,
      ),
    },
    {
      rule: "Brunch extension imports a sibling extension",
      edge: importEdge(
        `${packagesRoot}/plugin-gherkin/src/index.ts`,
        "@hashintel/brunch-agent-plugin-sdcpn",
        `${packagesRoot}/plugin-sdcpn/src/index.ts`,
      ),
    },
    {
      rule: "production source imports test code",
      edge: importEdge(
        `${packagesRoot}/core/src/index.ts`,
        "../test/client-tools.test.ts",
        `${packagesRoot}/core/test/client-tools.test.ts`,
      ),
    },
    {
      rule: "internal import could not be resolved",
      edge: importEdge(
        `${appRoot}/src/app.ts`,
        "@apps/missing",
        "@apps/missing",
        true,
      ),
    },
  ])("classifies '$rule'", ({ edge, rule }) => {
    expect(violationsFrom([edge])).toEqual([
      expect.stringContaining(`${rule}:`),
    ]);
  });

  test("keeps production imports inside the declared topology", async () => {
    const edges = importEdgesFrom(await cruiseModules());
    expect(violationsFrom(edges)).toEqual([]);
  });
});
