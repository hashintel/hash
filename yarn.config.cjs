/**
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Context} Context
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 */

/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require(`@yarnpkg/types`);

/**
 * Enforces consistent dependency versions across all workspaces in the project.
 *
 * This rule ensures that all workspaces use the same version of a given dependency.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceConsistentDependenciesAcrossTheProject({ Yarn }) {
  for (const dependency of Yarn.dependencies()) {
    if (dependency.type === `peerDependencies`) continue;

    for (const otherDependency of Yarn.dependencies({
      ident: dependency.ident,
    })) {
      if (otherDependency.type === `peerDependencies`) continue;

      dependency.update(otherDependency.range);
    }
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

module.exports = defineConfig({
  async constraints(context) {
    enforceWorkspaceDependenciesDeclaredAsSuch(context);
    // enforceConsistentDependenciesAcrossTheProject(context);
    enforcePortalProtocolInsteadOfFileProtocol(context);
  },
});
