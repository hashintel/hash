const path = require("node:path");
const fs = require("node:fs");

const monorepoRoot = path.resolve(__dirname, "../../..");

/**
 * ESlint requires .eslintignore file to be placed next to .eslintrc.cjs file.
 * Because .*ignore files are not composable, we cannot import or otherwise reuse
 * a top-level .eslintignore. To avoid repetition and to maintain a coherent behavior
 * of ESLint CLI and IDE extensions, we generate ignore patterns for each workspace
 * based from .prettierignore. This is done via ignorePatterns option in ESLint config.
 *
 * @param {string} workspaceDirPath
 * @returns {string[]}
 */
module.exports = (workspaceDirPath) => {
  const [, match] =
    fs
      .readFileSync(`${monorepoRoot}/.prettierignore`, "utf8")
      .match(/Same as in .gitignore([^\0]*?)$/) ?? [];

  if (!match) {
    throw new Error(
      "Could not find shared .prettierignore patterns. Please update .prettierignore or the regexp in this file.",
    );
  }

  const workspaceDirPrefix = `/${path
    .relative(monorepoRoot, workspaceDirPath)
    .replace(/\\/g, "/")}/`;

  const sharedPatternsFromPrettierignore = match
    .split("\n")
    .map((line) => {
      // Ignore empty lines and comments
      if (!line || line.startsWith("#")) {
        return [];
      }
      // Ignore patterns specific to other workspaces
      if (
        line.includes("/") &&
        !line.match(/^[^/]+\/$/) &&
        !line.startsWith(workspaceDirPrefix) &&
        !line.startsWith("**")
      ) {
        return [];
      }
      // Remove workspace-specific prefix (path/to/workspace/foo/**/bar => foo/**/bar)
      if (line.startsWith(workspaceDirPrefix)) {
        return [line.replace(workspaceDirPrefix, "")];
      }
      // Keep other patterns as is
      return [line];
    })
    .flat();

  return [
    // Ignore all files (but still allow sub-folder scanning)
    "*",
    "!*/",

    // Allow certain file types
    "!*.cjs",
    "!*.js",
    "!*.json",
    "!*.jsx",
    "!*.mjs",
    "!*.ts",
    "!*.tsx",

    // Add patterns extracted from .prettierignore
    ...sharedPatternsFromPrettierignore,
  ];
};
