/**
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Context} Context
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 */

/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require(`@yarnpkg/types`);

const enforcedDevDependencies = {
  prettier: { commands: ["prettier"], ident: "prettier" },
  waitOn: { commands: ["wait-on"], ident: "wait-on" },
  rimraf: { commands: ["rimraf"], ident: "rimraf" },
  eslint: { commands: ["eslint"], ident: "eslint" },
  typescript: { commands: ["tsc", "ts-node"], ident: "typescript" },
  crossEnv: { commands: ["cross-env"], ident: "cross-env" },
};

const ignoredDependencies = ["@blockprotocol/graph", "@sentry/webpack-plugin"];
const ignoredWorkspaces = [
  "@apps/hashdotdev",
  "@blocks/embed",
  "@blocks/person",
];

/**
 *
 * @param {Dependency} dependency
 */
const shouldIgnoreDependency = (dependency) =>
  ignoredDependencies.includes(dependency.ident) ||
  ignoredWorkspaces.includes(dependency.workspace.ident) ||
  dependency.type === "peerDependencies";

/**
 * Enforces consistent dependency versions across all workspaces in the project.
 *
 * This rule ensures that all workspaces use the same version of a given dependency.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceConsistentDependenciesAcrossTheProject({ Yarn }) {
  for (const dependency of Yarn.dependencies()) {
    if (shouldIgnoreDependency(dependency)) {
      continue;
    }

    for (const otherDependency of Yarn.dependencies({
      ident: dependency.ident,
    })) {
      if (shouldIgnoreDependency(otherDependency)) {
        continue;
      }

      dependency.update(otherDependency.range);
    }
  }
}

/**
 * Enforces no dual-type dependencies across workspaces.
 *
 * This function ensures that a dependency is not listed in both "dependencies"
 * and "devDependencies" for any workspace. If a dependency is found in both,
 * it removes it from "dependencies", keeping it only in "devDependencies".
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceNoDualTypeDependencies({ Yarn }) {
  for (const devDependency of Yarn.dependencies({ type: "devDependencies" })) {
    devDependency.workspace.unset(`dependency.${devDependency.ident}`);
  }
}

/**
 * Enforces the use of the `workspace:` protocol for all workspace dependencies.
 *
 * This rule ensures that all dependencies that are part of the workspace are
 * declared using the `workspace:` protocol.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceWorkspaceDependenciesDeclaredAsSuch({ Yarn }) {
  const workspaces = Yarn.workspaces();

  for (const dependency of Yarn.dependencies()) {
    if (
      workspaces.some(
        (workspace) =>
          workspace.ident === dependency.ident &&
          workspace.pkg.version === dependency.range,
      )
    ) {
      dependency.update("workspace:^");
    }
  }
}

/**
 * This rule prohibits the use of the 'file:' protocol in dependency ranges
 * and replaces it with the 'portal:' protocol.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforcePortalProtocolInsteadOfFileProtocol({ Yarn }) {
  for (const dependency of Yarn.dependencies()) {
    if (dependency.range.startsWith("file:")) {
      dependency.update(dependency.range.replace("file:", "portal:"));
    }
  }
}

/**
 * Enforces proper declaration of dev dependencies.
 *
 * This rule checks if certain tools (like Prettier) are used in any workspace
 * and ensures they're declared as dev dependencies in those workspaces.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceDevDependenciesAreProperlyDeclared({ Yarn }) {
  const dependencies = Object.fromEntries(
    Object.entries(enforcedDevDependencies).map(([key, { ident }]) => [
      key,
      Yarn.dependency({ ident }),
    ]),
  );

  for (const workspace of Yarn.workspaces()) {
    /** @type {Record<string, string> | undefined} */
    const scripts = workspace.manifest.scripts;

    if (!scripts) {
      continue;
    }

    const dependsOn = {
      prettier: false,
      waitOn: false,
      rimraf: false,
      eslint: false,
      typescript: false,
      crossEnv: false,
    };

    for (const script of Object.values(scripts)) {
      for (const [key, { commands }] of Object.entries(
        enforcedDevDependencies,
      )) {
        const scriptSplit = script.split(" ");

        if (commands.some((command) => scriptSplit.includes(command))) {
          dependsOn[key] = true;
        }
      }
    }

    for (const [key, value] of Object.entries(dependsOn)) {
      if (!value) {
        workspace.unset(`devDependencies.${dependencies[key].ident}`);
        continue;
      }

      const dependency = dependencies[key];

      if (dependency === null) {
        workspace.error(
          `missing devDependency ${key}, unable to automatically determine the version`,
        );
        continue;
      }

      workspace.set(`devDependencies.${dependency.ident}`, dependency.range);
    }
  }
}

module.exports = defineConfig({
  async constraints(context) {
    // enforceWorkspaceDependenciesDeclaredAsSuch(context);
    enforceConsistentDependenciesAcrossTheProject(context);
    enforceNoDualTypeDependencies(context);
    // enforcePortalProtocolInsteadOfFileProtocol(context);
    enforceDevDependenciesAreProperlyDeclared(context);
  },
});
