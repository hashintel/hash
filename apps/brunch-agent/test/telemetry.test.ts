import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { expect, test, vi } from "vitest";

import {
  type BrunchOpenTelemetrySetup,
  createBrunchTelemetryInstrumentation,
} from "../src/telemetry.ts";

test("production requires a HASH collector endpoint", () => {
  expect(() =>
    createBrunchTelemetryInstrumentation({ NODE_ENV: "production" }),
  ).toThrow("HASH_OTLP_ENDPOINT");
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
    forceFlush: async () => undefined,
    logger: logs.getLogger("brunch-test"),
    meter: metrics.getMeter("brunch-test"),
    shutdown: async () => {
      order.push("sdk");
    },
    tracer: trace.getTracer("brunch-test"),
  } satisfies BrunchOpenTelemetrySetup & { endpoint: string };
  const registerHashOpenTelemetry = vi.fn<
    (input: {
      endpoint: string;
      serviceName: string;
    }) => BrunchOpenTelemetrySetup
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
    forceFlush: async () => undefined,
    logger: logs.getLogger("brunch-test"),
    meter: metrics.getMeter("brunch-test"),
    shutdown: async () => undefined,
    tracer: trace.getTracer("brunch-test"),
  } satisfies BrunchOpenTelemetrySetup;
  const registerHashOpenTelemetry = vi.fn<
    (input: {
      endpoint: string;
      serviceName: string;
    }) => BrunchOpenTelemetrySetup
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
