import { existsSync, readdirSync } from "node:fs";
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

const includedModulePattern =
  /^(?:apps\/brunch-agent\/(?:src|test)\/|apps\/brunch-agent\/[^/]+\.config\.ts$|libs\/@hashintel\/brunch-agent\/packages\/[^/]+\/(?:src|test)\/)/u;

interface ImportEdge {
  readonly source: string;
  readonly dependency: IDependency;
}

const importEdgesFrom = (modules: readonly IModule[]): ImportEdge[] =>
  modules.flatMap((module) =>
    module.dependencies.map((dependency) => ({
      source: module.source,
      dependency,
    })),
  );

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

const targetOf = ({ dependency }: ImportEdge): string => dependency.resolved;

const describeEdge = (edge: ImportEdge): string =>
  `${edge.source} -> ${targetOf(edge)}`;

const isSourceModule = (modulePath: string): boolean =>
  modulePath.startsWith(`${appRoot}/src/`) ||
  /^libs\/@hashintel\/brunch-agent\/packages\/[^/]+\/src\//u.test(modulePath);

const isTestModule = (modulePath: string): boolean =>
  modulePath.startsWith(`${appRoot}/test/`) ||
  /^libs\/@hashintel\/brunch-agent\/packages\/[^/]+\/test\//u.test(modulePath);

const isAppModule = (modulePath: string): boolean =>
  modulePath.startsWith("apps/") || modulePath.startsWith("@apps/");

const cruiseModules = async (): Promise<readonly IModule[]> => {
  const result = await cruise(
    sourceRoots,
    {
      baseDir: repoRoot,
      includeOnly: includedModulePattern.source,
      moduleSystems: ["es6"],
      tsPreCompilationDeps: true,
    },
    {
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
  test("keeps production imports inside the declared topology", async () => {
    const edges = importEdgesFrom(await cruiseModules());

    const violations = edges.flatMap((edge) => {
      const target = targetOf(edge);
      const sourcePackage = brunchPackageFrom(edge.source);
      const targetPackage = brunchPackageFrom(target);
      const reasons: string[] = [];

      if (edge.source.startsWith("libs/") && isAppModule(target)) {
        reasons.push("library imports application");
      }
      if (
        edge.source.startsWith(`${appRoot}/`) &&
        (target.startsWith("apps/petrinaut-website/") ||
          target.startsWith("@apps/petrinaut-website"))
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
      if (isSourceModule(edge.source) && isTestModule(target)) {
        reasons.push("production source imports test code");
      }

      return reasons.map((reason) => `${reason}: ${describeEdge(edge)}`);
    });

    expect(violations).toEqual([]);
  });
});
