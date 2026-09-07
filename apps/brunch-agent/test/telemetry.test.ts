import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import {
  type Span,
  type SpanOptions,
  trace,
  type TracerProvider,
} from "@opentelemetry/api";
import { afterEach, expect, test, vi } from "vitest";

import {
  createBrunchTelemetryInstrumentation,
  errorCode,
  recordOperationalFailure,
} from "../src/telemetry.ts";

import type {
  OpenTelemetrySetup,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";

const collectorEndpoint = "http://collector.test:4317";

const setupWith = (shutdown: () => Promise<void>): OpenTelemetrySetup =>
  ({ endpoint: collectorEndpoint, shutdown }) as unknown as OpenTelemetrySetup;

afterEach(() => {
  trace.disable();
});

test("production requires a HASH collector endpoint", () => {
  expect(() =>
    createBrunchTelemetryInstrumentation({ NODE_ENV: "production" }),
  ).toThrow("HASH_OTLP_ENDPOINT");
});

test("registers HASH's exporters before Flue and shuts them down after it", async () => {
  const order: string[] = [];
  const flueInstrumentation = createOpenTelemetryInstrumentation({
    content: false,
  });
  const createFlueInstrumentation = vi.fn<
    typeof createOpenTelemetryInstrumentation
  >(() => {
    order.push("flue-created");
    return {
      ...flueInstrumentation,
      dispose: () => {
        order.push("flue-disposed");
      },
    };
  });
  const register = vi.fn<typeof registerOpenTelemetry>(() => {
    order.push("exporters-registered");
    return setupWith(async () => {
      order.push("exporters-shutdown");
    });
  });

  const instrumentation = createBrunchTelemetryInstrumentation(
    {
      HASH_OTLP_ENDPOINT: collectorEndpoint,
      NODE_ENV: "production",
      OTEL_SERVICE_NAME: "Brunch Test",
    },
    { createFlueInstrumentation, registerOpenTelemetry: register },
  );
  await instrumentation.dispose();

  expect(createFlueInstrumentation).toHaveBeenCalledWith({ content: false });
  expect(register).toHaveBeenCalledWith({
    endpoint: collectorEndpoint,
    serviceName: "Brunch Test",
    instrumentations: [expect.anything(), expect.anything()],
  });
  expect(order).toEqual([
    "exporters-registered",
    "flue-created",
    "flue-disposed",
    "exporters-shutdown",
  ]);
});

test("trims collector configuration supplied through the environment", async () => {
  const register = vi.fn<typeof registerOpenTelemetry>(() =>
    setupWith(async () => undefined),
  );

  const instrumentation = createBrunchTelemetryInstrumentation(
    {
      HASH_OTLP_ENDPOINT: ` ${collectorEndpoint}\n`,
      NODE_ENV: "production",
      OTEL_SERVICE_NAME: " Brunch Test\n",
    },
    {
      createFlueInstrumentation: () =>
        createOpenTelemetryInstrumentation({ content: false }),
      registerOpenTelemetry: register,
    },
  );
  await instrumentation.dispose();

  expect(register).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: collectorEndpoint,
      serviceName: "Brunch Test",
    }),
  );
});

test("runs without exporters when no collector is configured outside production", async () => {
  const register = vi.fn<typeof registerOpenTelemetry>();

  const instrumentation = createBrunchTelemetryInstrumentation(
    { NODE_ENV: "test" },
    {
      createFlueInstrumentation: () =>
        createOpenTelemetryInstrumentation({ content: false }),
      registerOpenTelemetry: register,
    },
  );
  await instrumentation.dispose();

  expect(register).not.toHaveBeenCalled();
});

test("records failures by error code, never by message", async () => {
  const recorded: (SpanOptions | undefined)[] = [];
  const span = {
    end: vi.fn<Span["end"]>(),
    setStatus: vi.fn<Span["setStatus"]>(),
  } as unknown as Span;
  const provider = {
    getTracer: () => ({
      startSpan: (_name: string, options?: SpanOptions) => {
        recorded.push(options);
        return span;
      },
    }),
  } as unknown as TracerProvider;
  trace.setGlobalTracerProvider(provider);

  const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1"), {
    code: "ECONNREFUSED",
  });
  await recordOperationalFailure("database_operation", refused);
  await recordOperationalFailure(
    "database_configuration",
    new TypeError("BRUNCH_POSTGRES_PORT must be an integer"),
  );

  expect(recorded.map((options) => options?.attributes)).toEqual([
    {
      "brunch.failure.stage": "database_operation",
      "error.type": "ECONNREFUSED",
    },
    {
      "brunch.failure.stage": "database_configuration",
      "error.type": "TypeError",
    },
  ]);
  expect(JSON.stringify(recorded)).not.toContain("10.0.0.1");
  expect(JSON.stringify(recorded)).not.toContain("BRUNCH_POSTGRES_PORT");
});

test("reads machine codes from Node, TLS, and pg errors only", () => {
  expect(errorCode(Object.assign(new Error("x"), { code: "28000" }))).toBe(
    "28000",
  );
  expect(errorCode(Object.assign(new Error("x"), { code: 42 }))).toBe(
    undefined,
  );
  expect(errorCode(new Error("x"))).toBe(undefined);
  expect(errorCode("not an error")).toBe(undefined);
});
