import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { expect, test, vi } from "vitest";

import {
  type BrunchOpenTelemetrySetup,
  createBrunchTelemetryInstrumentation,
  recordOperationalFailure,
} from "../src/telemetry.ts";

test("production continues without a HASH collector endpoint", async () => {
  const registerHashOpenTelemetry = vi.fn<
    (input: { endpoint: string | undefined; serviceName: string }) => undefined
  >(() => undefined);
  const instrumentation = createBrunchTelemetryInstrumentation(
    { NODE_ENV: "production" },
    { registerHashOpenTelemetry },
  );

  expect(registerHashOpenTelemetry).toHaveBeenCalledWith({
    endpoint: undefined,
    serviceName: "Brunch Agent",
  });
  await instrumentation.dispose();
});

test("keeps Flue content disabled and flushes exporters after Flue disposal", async () => {
  const order: string[] = [];
  const flueInstrumentation = createOpenTelemetryInstrumentation({
    content: false,
  });
  const createFlueInstrumentation = vi.fn<
    typeof createOpenTelemetryInstrumentation
  >(() => ({
    ...flueInstrumentation,
    dispose: () => {
      order.push("flue");
    },
  }));
  const setup = {
    endpoint: "http://collector.test:4317",
    logger: logs.getLogger("brunch-test"),
    meter: metrics.getMeter("brunch-test"),
    shutdown: async () => {
      order.push("sdk");
    },
    tracer: trace.getTracer("brunch-test"),
  } satisfies BrunchOpenTelemetrySetup & { endpoint: string };
  const registerHashOpenTelemetry = vi.fn<
    (input: {
      endpoint: string | undefined;
      serviceName: string;
    }) => BrunchOpenTelemetrySetup | undefined
  >(() => setup);

  const instrumentation = createBrunchTelemetryInstrumentation(
    {
      HASH_OTLP_ENDPOINT: setup.endpoint,
      NODE_ENV: "production",
      OTEL_SERVICE_NAME: "Brunch Test",
    },
    {
      createFlueInstrumentation,
      registerHashOpenTelemetry,
    },
  );
  await instrumentation.dispose();

  expect(createFlueInstrumentation).toHaveBeenCalledWith({
    content: false,
    logger: setup.logger,
    meter: setup.meter,
    tracer: setup.tracer,
  });
  expect(registerHashOpenTelemetry).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: setup.endpoint,
      serviceName: "Brunch Test",
    }),
  );
  expect(order).toEqual(["flue", "sdk"]);
});

test("trims collector configuration supplied through the environment", async () => {
  const flueInstrumentation = createOpenTelemetryInstrumentation({
    content: false,
  });
  const setup = {
    logger: logs.getLogger("brunch-test"),
    meter: metrics.getMeter("brunch-test"),
    shutdown: async () => undefined,
    tracer: trace.getTracer("brunch-test"),
  } satisfies BrunchOpenTelemetrySetup;
  const registerHashOpenTelemetry = vi.fn<
    (input: {
      endpoint: string | undefined;
      serviceName: string;
    }) => BrunchOpenTelemetrySetup | undefined
  >(() => setup);

  const instrumentation = createBrunchTelemetryInstrumentation(
    {
      HASH_OTLP_ENDPOINT: " http://collector.test:4317\n",
      NODE_ENV: "production",
      OTEL_SERVICE_NAME: " Brunch Test\n",
    },
    {
      createFlueInstrumentation: () => flueInstrumentation,
      registerHashOpenTelemetry,
    },
  );
  await instrumentation.dispose();

  expect(registerHashOpenTelemetry).toHaveBeenCalledWith({
    endpoint: "http://collector.test:4317",
    serviceName: "Brunch Test",
  });
});

test("records operational failures without requiring an exporter", () => {
  expect(() =>
    recordOperationalFailure("database_operation", new Error("query")),
  ).not.toThrow();
  expect(() =>
    recordOperationalFailure("database_configuration", new Error("startup")),
  ).not.toThrow();
});
