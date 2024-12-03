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

/**
 * Enforces proper declaration of dev dependencies.
 *
 * This rule checks if certain tools (like Prettier) are used in any workspace
 * and ensures they're declared as dev dependencies in those workspaces.
 *
 * @param {Context} context - The Yarn constraint context.
 */
function enforceDevDependenciesAreProperlyDeclared({ Yarn }) {
  const rootWorkspace = Yarn.workspace();

  // get all required versions from @apps/hash-api
  const workspace = Yarn.workspace({ ident: "@apps/hash-api" });

  /** @type {Dependency} */
  const prettier = Yarn.dependency({
    workspace: rootWorkspace,
    ident: "prettier",
  });
  const waitOn = Yarn.dependency({
    workspace: rootWorkspace,
    ident: "wait-on",
  });
  /** @type {Dependency} */
  const rimraf = Yarn.dependency({ workspace, ident: "rimraf" });
  /** @type {Dependency} */
  const eslint = Yarn.dependency({ workspace, ident: "eslint" });
  /** @type {Dependency} */
  const typescript = Yarn.dependency({ workspace, ident: "typescript" });
  /** @type {Dependency} */
  const crossEnv = Yarn.dependency({ workspace, ident: "cross-env" });

  const workspaces = Yarn.workspaces();
  for (const workspace of workspaces) {
    if (workspace.ident === rootWorkspace.ident) {
      continue;
    }

    /** @type {Record<string, string> | undefined} */
    const scripts = workspace.manifest.scripts;

    if (!scripts) {
      continue;
    }

    // scripts is a key-value object
    for (const value of Object.values(scripts)) {
      if (value.includes("prettier")) {
        workspace.set("devDependencies.prettier", prettier.range);
      }

      if (value.includes("wait-on")) {
        workspace.set("devDependencies.wait-on", waitOn.range);
      }

      if (value.includes("rimraf")) {
        workspace.set("devDependencies.rimraf", rimraf.range);
      }

      if (value.includes("eslint")) {
        workspace.set("devDependencies.eslint", eslint.range);
      }

      if (value.includes("ts-node") || value.includes("tsc")) {
        workspace.set("devDependencies.typescript", typescript.range);
      }

      if (value.includes("cross-env")) {
        workspace.set("devDependencies.cross-env", crossEnv.range);
      }
    }
  }
}

module.exports = defineConfig({
  async constraints(context) {
    // enforceWorkspaceDependenciesDeclaredAsSuch(context);
    // enforceConsistentDependenciesAcrossTheProject(context);
    // enforcePortalProtocolInsteadOfFileProtocol(context);
    enforceDevDependenciesAreProperlyDeclared(context);
  },
});
