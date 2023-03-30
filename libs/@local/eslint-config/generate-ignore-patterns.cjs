const path = require("node:path");
const fs = require("node:fs");

const monorepoRoot = path.resolve(__dirname, "../../..");

// Check if the line's glob affects this workspace e.g.
// say the path to this workspace is `path/to/workspace/foo`
// - if the line is `path/to/**/bar`
//     then we want patterns equivalent to `**/bar`
//     as `path/to/**` overlaps the current path
// - if the line is `**/bar`
//     then we want patterns equivalent to `**/bar`
//     as `**` overlaps the current path
// - if the line is `path/to/**/foo/bar**`
//     then we want patterns equivalent to [`bar**`, `**/foo/bar/**`]
//     as both `path/to/**/foo` and `path/to/**` overlaps the current path
/**
 * Given a path from a .gitignore in a parent directory, this returns the equivalent paths if written in the current
 * directory
 *
 * @param pattern
 * @param workspaceDirPrefix
 * @returns {[string]}
 */
const getEquivalentIgnorePaths = (pattern, workspaceDirPrefix) => {
  // We want to traverse the components of the workspaceDirPrefix, and consume wild cards whenever they match.
  // On some wildcards there may be a branch of equivalent paths, e.g. for a "**" wildcard
  const getEquivalentPaths = (pathComponents, patternComponents) => {
    let equivalentPaths = new Set();

    let i = 0;
    for (; i < patternComponents.length; i++) {
      const patternComponent = patternComponents[i];
      const pathComponent = pathComponents[i];

      // This could happen if the pattern started or ended with `/`
      if (patternComponent === "") {
        break;
      }

      if (!pathComponent) {
        // We have reached the end of the path components
        equivalentPaths.add(patternComponents.slice(i).join("/"));
        break;
      }

      if (patternComponent === pathComponent) {
      } else if (patternComponent === "**") {
        // We can choose to use ** once, or multiple times, or never

        // we use and consume **, so we advance both sets of components
        getEquivalentPaths(
          pathComponents.slice(i + 1),
          patternComponents.slice(i + 1),
        ).forEach((path) => equivalentPaths.add(path));
        // we use ** but don't consume it, so we advance the path components by one but leave the pattern as is
        getEquivalentPaths(
          pathComponents.slice(i + 1),
          patternComponents.slice(i),
        ).forEach((path) => equivalentPaths.add(path));
        // we don't use but consume **, so we advance the pattern components by one but leave the path as is
        getEquivalentPaths(
          pathComponents.slice(i),
          patternComponents.slice(i + 1),
        ).forEach((path) => equivalentPaths.add(path));
      } else if (patternComponent === "*") {
        // We must consume "*" if it is present
        getEquivalentPaths(
          pathComponents.slice(i + 1),
          patternComponents.slice(i + 1),
        ).forEach((path) => equivalentPaths.add(path));
      }
    }

    return equivalentPaths;
  };

  return [
    ...getEquivalentPaths(workspaceDirPrefix.split("/"), pattern.split("/")),
  ];
};

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

  const sharedPatternsFromPrettierIgnore = match
    .split("\n")
    .map((line) => {
      // Ignore empty lines and comments
      if (!line || line.startsWith("#")) {
        return [];
      }

      if (line.includes("**")) {
        // remove the leading "/" from the workspaceDirPrefix as we need to check it as a relative path
        const relativePrefix = workspaceDirPrefix.slice(1);

        const overlappingPatterns = getEquivalentIgnorePaths(
          line.startsWith("/") ? line.slice(1) : line,
          relativePrefix,
        );

        if (overlappingPatterns.length > 0) {
          return overlappingPatterns;
        }
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
    ...sharedPatternsFromPrettierIgnore,
  ];
};
