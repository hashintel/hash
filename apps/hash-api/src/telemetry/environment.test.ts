import { afterEach, describe, expect, it, vi } from "vitest";

const loadTelemetryEnvironment = async () => {
  vi.resetModules();
  const module = await import("./environment");
  return module.telemetryEnvironment;
};

describe("telemetryEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to development when ENVIRONMENT is unset", async () => {
    vi.stubEnv("ENVIRONMENT", "");
    await expect(loadTelemetryEnvironment()).resolves.toBe("development");
  });

  it("resolves production from ENVIRONMENT", async () => {
    vi.stubEnv("ENVIRONMENT", "production");
    await expect(loadTelemetryEnvironment()).resolves.toBe("production");
  });

  it("resolves staging from ENVIRONMENT", async () => {
    vi.stubEnv("ENVIRONMENT", "staging");
    await expect(loadTelemetryEnvironment()).resolves.toBe("staging");
  });

  it("treats any other ENVIRONMENT value as development", async () => {
    vi.stubEnv("ENVIRONMENT", "qa");
    await expect(loadTelemetryEnvironment()).resolves.toBe("development");
  });
});
