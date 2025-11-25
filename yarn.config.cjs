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

const ignoredDependencies = [
  "@blockprotocol/graph",
  "@sentry/webpack-plugin",
  // Petrinaut SDCPN uses multiple packages which are many versions behind in other workspaces
  // To be un-ignored once H-5639 completed
  "vitest",
  "@dnd-kit/sortable",
  "@babel/core",
];
const ignoredWorkspaces = [];

const allowedGitDependencies = [];

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
 * Enforce that the package protocols are correct.
 *
 * @param {Context} context
 */
function enforceProtocols({ Yarn }) {
  const workspaces = Yarn.workspaces();

  for (const dependency of Yarn.dependencies()) {
    if (shouldIgnoreDependency(dependency)) {
      continue;
    }

    const workspaceDependency = workspaces.find(
      (workspace) => workspace.ident === dependency.ident,
    );

    if (workspaceDependency) {
      // turbo doesn't support the `workspace:` protocol when rewriting lockfiles, leading to inconsistent lockfiles
      dependency.update(workspaceDependency.manifest.version);
    }

    if (dependency.range.startsWith("file:")) {
      // the file: protocol makes problems when used in conjunction with pnpm mode, portal is the equivalent protocol
      dependency.update(dependency.range.replace("file:", "portal:"));
    }

    if (dependency.range.startsWith("link:")) {
      dependency.error(
        `The link protocol allows for non-packages to be linked and is not allowed, dependency: ${dependency.ident}`,
      );
    }

    if (dependency.range.startsWith("exec:")) {
      dependency.error(
        `The exec protocol allows for arbitrary code execution and is not allowed, dependency: ${dependency.ident}`,
      );
    }

    let shouldCheckIfValidGitDependency = false;

    if (
      dependency.range.startsWith("https://") ||
      dependency.range.startsWith("http://")
    ) {
      // always prefix with the git protocol
      dependency.update(`git:${dependency.range}`);
      shouldCheckIfValidGitDependency = true;
    }

    if (dependency.range.startsWith("ssh://")) {
      // always prefix with the git protocol
      dependency.update(`git:${dependency.range.replace(/^ssh:\/\//, "git:")}`);
      shouldCheckIfValidGitDependency = true;
    }

    if (
      (shouldCheckIfValidGitDependency ||
        dependency.range.startsWith("git:")) &&
      !allowedGitDependencies.includes(dependency.ident)
    ) {
      dependency.error(
        `arbitrary git dependencies are not allowed, dependency: ${dependency.ident}`,
      );
    }

    // patches are only allowed if they are for an `npm:` dpeendenct
    if (dependency.range.startsWith("patch:")) {
      const dependencySpecification = dependency.range.match(/^patch:([^#]+)/);
      if (!dependencySpecification) {
        dependency.error(
          `invalid patch protocol, dependency: ${dependency.ident}`,
        );
        continue;
      }

      // locator is on the right side
      // splitRight at `@`
      const segments = dependencySpecification[1].split("@");
      const last = segments.pop();
      // urldecode the last segment
      const version = decodeURIComponent(last);

      if (!version.startsWith("npm:")) {
        dependency.error(
          `patch protocol is only allowed for npm dependencies, dependency: ${dependency.ident}, patches: ${version}`,
        );
      }
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
        if (workspace.ident === "@local/eslint" && key === "eslint") {
          continue;
        }

        const scriptSplit = script.split(" ");

        if (commands.some((command) => scriptSplit.includes(command))) {
          dependsOn[key] = true;
        }
      }
    }

    for (const [key, value] of Object.entries(dependsOn)) {
      if (!value) {
        if (!dependencies[key]) {
          // dependency does not exist, so doesn't need to be enforced, as it doesn't exist
          continue;
        }

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
    enforceConsistentDependenciesAcrossTheProject(context);
    enforceNoDualTypeDependencies(context);
    enforceProtocols(context);
    enforceDevDependenciesAreProperlyDeclared(context);
  },
});
