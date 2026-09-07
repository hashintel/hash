import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { expect, test, vi } from "vitest";

import {
  type BrunchOpenTelemetrySetup,
  createBrunchHttpInstrumentation,
  createBrunchTelemetryInstrumentation,
  createBrunchUndiciInstrumentation,
  recordOperationalFailure,
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

test("flushes startup failures without blocking database operations", async () => {
  const forceFlush = vi.fn<() => Promise<void>>(async () => undefined);
  const flueInstrumentation = createOpenTelemetryInstrumentation({
    content: false,
  });
  const setup = {
    forceFlush,
    logger: logs.getLogger("brunch-test"),
    meter: metrics.getMeter("brunch-test"),
    shutdown: async () => undefined,
    tracer: trace.getTracer("brunch-test"),
  } satisfies BrunchOpenTelemetrySetup;
  const instrumentation = createBrunchTelemetryInstrumentation(
    {
      HASH_OTLP_ENDPOINT: "http://collector.test:4317",
      NODE_ENV: "production",
    },
    {
      createFlueInstrumentation: () => flueInstrumentation,
      registerHashOpenTelemetry: () => setup,
    },
  );

  await recordOperationalFailure("database_operation", new Error("query"));
  expect(forceFlush).not.toHaveBeenCalled();

  await recordOperationalFailure(
    "database_configuration",
    new Error("startup"),
  );
  expect(forceFlush).toHaveBeenCalledOnce();

  await instrumentation.dispose();
});

test("excludes health probes and collector traffic from HTTP telemetry", () => {
  const httpConfig = createBrunchHttpInstrumentation(
    "http://collector.test:4317",
  ).getConfig();
  const ignoreIncoming = httpConfig.ignoreIncomingRequestHook;
  const ignoreOutgoing = httpConfig.ignoreOutgoingRequestHook;
  if (!ignoreIncoming || !ignoreOutgoing) {
    throw new Error("Brunch HTTP telemetry filters must be configured.");
  }

  expect(
    ignoreIncoming({
      url: "/health?source=ecs",
    } as Parameters<typeof ignoreIncoming>[0]),
  ).toBe(true);
  expect(
    ignoreIncoming({
      url: "/api/chat",
    } as Parameters<typeof ignoreIncoming>[0]),
  ).toBe(false);
  expect(
    ignoreOutgoing({
      port: "4317",
    } as Parameters<typeof ignoreOutgoing>[0]),
  ).toBe(true);
  expect(
    ignoreOutgoing({
      port: 443,
    } as Parameters<typeof ignoreOutgoing>[0]),
  ).toBe(false);
});

test("excludes collector fetches without suppressing ordinary HTTPS", () => {
  const undiciConfig = createBrunchUndiciInstrumentation(
    "http://collector.test:4317",
  ).getConfig();
  const ignoreRequest = undiciConfig.ignoreRequestHook;
  if (!ignoreRequest) {
    throw new Error("Brunch Undici telemetry filter must be configured.");
  }

  expect(
    ignoreRequest({
      origin: "http://collector.test:4317",
    } as Parameters<typeof ignoreRequest>[0]),
  ).toBe(true);
  expect(
    ignoreRequest({
      origin: "https://api.anthropic.com",
    } as Parameters<typeof ignoreRequest>[0]),
  ).toBe(false);
});
