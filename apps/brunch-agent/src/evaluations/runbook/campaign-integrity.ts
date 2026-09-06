import { createHash } from "node:crypto";
import { readFile, readdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const sha256 = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Resolve aliases and symlinks even when the final output path does not exist yet. */
export const canonicalPath = async (path: string): Promise<string> => {
  const resolveFromExistingAncestor = async (
    candidate: string,
    missingSegments: readonly string[],
  ): Promise<string> => {
    try {
      return resolve(await realpath(candidate), ...missingSegments);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      return resolveFromExistingAncestor(parent, [
        basename(candidate),
        ...missingSegments,
      ]);
    }
  };

  return resolveFromExistingAncestor(resolve(path), []);
};

export const pathIsWithin = (candidate: string, directory: string): boolean => {
  const remainder = relative(directory, candidate);
  return (
    remainder === "" ||
    (!remainder.startsWith(`..${sep}`) &&
      remainder !== ".." &&
      !isAbsolute(remainder))
  );
};

export const rejectImmutableBaselineOutput = async (
  outputPath: string,
  immutableBaselinePath: string,
): Promise<string> => {
  const [canonicalOutput, canonicalBaseline] = await Promise.all([
    canonicalPath(outputPath),
    canonicalPath(immutableBaselinePath),
  ]);
  if (pathIsWithin(canonicalOutput, canonicalBaseline)) {
    throw new Error(
      "Output path is inside the immutable vestera-prospective-baseline-v1 campaign.",
    );
  }
  return canonicalOutput;
};

const filesystemPathFrom = (specifier: string): string =>
  specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier;

export const assertApprovedHermeticModelModules = async (
  repositoryRootPath: string,
  modules: {
    readonly expert: string;
    readonly interviewer: string;
  },
): Promise<void> => {
  const approved = {
    expert: join(
      repositoryRootPath,
      "apps/brunch-agent/test/runbook-elicitation-faux-expert.ts",
    ),
    interviewer: join(
      repositoryRootPath,
      "apps/brunch-agent/test/runbook-elicitation-faux-provider.ts",
    ),
  };
  const [expert, interviewer, approvedExpert, approvedInterviewer] =
    await Promise.all([
      canonicalPath(filesystemPathFrom(modules.expert)),
      canonicalPath(filesystemPathFrom(modules.interviewer)),
      canonicalPath(approved.expert),
      canonicalPath(approved.interviewer),
    ]);
  if (expert !== approvedExpert || interviewer !== approvedInterviewer) {
    throw new Error(
      "Hermetic model overrides must use the approved checked-in faux fixtures.",
    );
  }
};

export interface BuiltArtifactManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export const builtServerArtifactManifest = async (
  repositoryRootPath: string,
): Promise<readonly BuiltArtifactManifestEntry[]> => {
  const distDirectory = join(repositoryRootPath, "apps/brunch-agent/dist");
  const entries = (await readdir(distDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  if (entries.length === 0) {
    throw new Error("The built server dist contains no .mjs artifacts.");
  }
  return Promise.all(
    entries.map(async (name) => {
      const absolutePath = join(distDirectory, name);
      return {
        path: relative(repositoryRootPath, absolutePath).split(sep).join("/"),
        sha256: sha256(await readFile(absolutePath)),
      };
    }),
  );
};
