/**
 * Verifies that a package about to be packed carries none of the proprietary
 * fonts kept in this package, whose license forbids redistributing them.
 *
 * This is intended to run as part of `prepack` (with the package directory as
 * the working directory), so that `yarn pack` / `changeset publish` fails
 * instead of shipping a font to npm.
 *
 * A font is matched by its content, so a renamed copy is still found, in the
 * two forms a build produces: the file itself, and a base64 data URI inside
 * another file, which is how a Vite library build embeds a font that its
 * source imports.
 *
 * Zero dependencies on purpose: it must be runnable in the publish
 * environment before/without a workspace install.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fontsDir = fileURLToPath(new URL(".", import.meta.url));
const fontFilePattern = /\.(woff2?|otf|ttf)$/i;
const skippedDirNames = new Set(["node_modules", ".git", ".turbo"]);

// A multiple of three, so the base64 of this many leading bytes is also the
// start of the base64 of the whole file.
const signatureLength = 600;

const packageDir = resolve(process.argv[2] ?? process.cwd());
const packageJsonPath = join(packageDir, "package.json");

if (!existsSync(packageJsonPath)) {
  console.error(`check-package-fonts: no package.json found in ${packageDir}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const packageName = packageJson.name ?? packageDir;

/**
 * @param {string} path a file or a directory
 * @returns {string[]} the files at or below it
 */
const listFiles = (path) => {
  if (!existsSync(path)) {
    return [];
  }
  if (!statSync(path).isDirectory()) {
    return [path];
  }
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    skippedDirNames.has(entry.name) ? [] : listFiles(join(path, entry.name)),
  );
};

const fonts = existsSync(fontsDir)
  ? listFiles(fontsDir)
      .filter((path) => fontFilePattern.test(path))
      .map((path) => {
        const head = readFileSync(path).subarray(0, signatureLength);
        return {
          name: relative(fontsDir, path),
          signatures: [head, Buffer.from(head.toString("base64"))],
        };
      })
  : [];

if (fonts.length === 0) {
  console.error(
    `check-package-fonts: no font files found in ${fontsDir} — refusing to pack without the fonts to check the payload against`,
  );
  process.exit(1);
}

// The `files` entries of the two packages this guards are plain paths. An
// entry with a glob is searched from the directory before its first wildcard.
const payloadRoots = Array.isArray(packageJson.files)
  ? packageJson.files.map((entry) =>
      resolve(packageDir, `./${entry}`.split(/[*?[{!]/)[0]),
    )
  : [packageDir];

const payloadFiles = [...new Set(payloadRoots.flatMap(listFiles))].sort();

/** @type {string[]} */
const problems = [];

for (const path of payloadFiles) {
  const contents = readFileSync(path);
  for (const font of fonts) {
    if (font.signatures.some((signature) => contents.includes(signature))) {
      problems.push(`${relative(packageDir, path)} contains ${font.name}`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `check-package-fonts: ${packageName} would publish a font from @local/brand-fonts, which may not be redistributed:`,
  );
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `check-package-fonts: ${packageName} — none of ${fonts.length} brand font(s) found in ${payloadFiles.length} file(s)`,
);
