import runtimeLock from "@local/petrinaut-optimizer-core/runtime-lock.json";

export type OptimizerPyodideConfig = {
  /** Where `pyodide.mjs`, the runtime assets and the distribution packages load from. */
  readonly indexURL: string;
  /** PyPI package name → exact version, installed with micropip. */
  readonly packages: Readonly<Record<string, string>>;
  /** Packages loaded from the Pyodide distribution rather than from PyPI. */
  readonly distributionPackages: readonly string[];
};

export const defaultOptimizerPyodideConfig = (): OptimizerPyodideConfig => ({
  indexURL: `https://cdn.jsdelivr.net/pyodide/v${runtimeLock.pyodide}/full/`,
  packages: runtimeLock.packages,
  distributionPackages: runtimeLock.pyodideDistributionPackages,
});

export const micropipRequirements = (
  config: Pick<OptimizerPyodideConfig, "packages">,
): string[] =>
  Object.entries(config.packages).map(
    ([name, version]) => `${name}==${version}`,
  );
