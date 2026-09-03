import { describe, expect, it } from "vitest";

import runtimeLock from "@local/petrinaut-optimizer-core/runtime-lock.json";

import {
  defaultOptimizerPyodideConfig,
  micropipRequirements,
} from "./pyodide-config";

describe("defaultOptimizerPyodideConfig", () => {
  it("pins the CDN runtime and the packages to the shared runtime lock", () => {
    const config = defaultOptimizerPyodideConfig();

    expect(config.indexURL).toBe(
      `https://cdn.jsdelivr.net/pyodide/v${runtimeLock.pyodide}/full/`,
    );
    expect(config.packages).toEqual(runtimeLock.packages);
    expect(config.distributionPackages).toEqual(
      runtimeLock.pyodideDistributionPackages,
    );
    expect(config.packages.optuna).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("micropipRequirements", () => {
  it("formats exact-version requirements", () => {
    expect(
      micropipRequirements({
        packages: { optuna: "4.9.0", colorlog: "6.10.1" },
      }),
    ).toEqual(["optuna==4.9.0", "colorlog==6.10.1"]);
  });
});
