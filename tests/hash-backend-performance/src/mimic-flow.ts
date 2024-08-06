import * as console from "node:console";

import { monorepoRootDir } from "@local/hash-backend-utils/environment";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import opentelemetry, { SpanKind, ValueType } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { Resource } from "@opentelemetry/resources";
import {
  ConsoleMetricExporter,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { AggregationTemporality } from "@opentelemetry/sdk-metrics/build/src/export/AggregationTemporality";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_NAMESPACE,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { config } from "dotenv-flow";
import { v4 as uuid } from "uuid";

import { getOryKratosClient } from "./authentication/kratos";
import {
  completeUserRegistration,
  getUserByKratosIdentityId,
} from "./graph/user";
import { createTraceHeaders } from "./tracing/request";

config({ silent: true, path: monorepoRootDir });

const metricExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 1000,
});
const httpInstrumentation = new HttpInstrumentation();

const unregisterInstrumentations = registerInstrumentations({
  instrumentations: [httpInstrumentation],
});

// export const registerOpenTelemetryTracing = (): (() => Promise<void>) => {
//   const exporter = new OTLPTraceExporter();
//
//   const provider = new NodeTracerProvider({
//     resource: Resource.default().merge(
//       new Resource({ "service.name": "Load tests" }),
//     ),
//   });
//
//   provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
//
//   provider.register();
//
//   return async () => {
//     await provider.shutdown();
//     unregisterInstrumentations();
//   };
// };
//
// const sdk = { shutdown: registerOpenTelemetryTracing() };
// const metricExporter = new InMemoryMetricExporter(
//   AggregationTemporality.CUMULATIVE,
// );
// const metricReader = new PeriodicExportingMetricReader({
//   exporter: metricExporter,
//   exportIntervalMillis: 1000,
// });
// const httpInstrumentation = new HttpInstrumentation();
// console.log(process.env);
const sdk = new NodeSDK({
  resource: Resource.default().merge(
    new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "Load tests",
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version,
      [SEMRESATTRS_SERVICE_NAMESPACE]: "hash",
    }),
  ),
  instrumentations: [httpInstrumentation],
  traceExporter: new OTLPTraceExporter(),
  metricReader,
});
httpInstrumentation.setMeterProvider(opentelemetry.metrics.getMeterProvider());
httpInstrumentation.setTracerProvider(opentelemetry.trace.getTracerProvider());
console.log(sdk);
sdk.start();
console.log(httpInstrumentation);

type Context = {
  session?: {
    token: string;
    expiresAt?: number;
    user: SimpleProperties<User["properties"]> & { password: string };
    ownedById: OwnedById;
  };
};

type StepDefinition = {
  name: string;
  function: (context: Context) => Promise<void>;
};

type ScenarioDefinition = {
  name: string;
  flow: StepDefinition[];
};

const tracer = opentelemetry.trace.getTracer("hash-backend-performance");
const meter = opentelemetry.metrics.getMeter("hash-backend-performance");

const scenario: ScenarioDefinition = {
  name: "Signup user",
  flow: [
    {
      name: "Register user",
      function: async (context) => {
        const oryKratosClient = getOryKratosClient();
        const traceHeaders = {};
        // inject context to trace headers for propagtion to the next service
        opentelemetry.propagation.inject(
          opentelemetry.context.active(),
          traceHeaders,
        );

        const { data: registrationFlow } =
          await oryKratosClient.createNativeRegistrationFlow(
            {},
            {
              headers: traceHeaders,
            },
          );

        // We either use the VU uuid or a new one if it is not available (e.g. in the case of a global account creation)
        const baseName = uuid();
        const password = baseName;

        const shortname = `vu-${baseName.substring(0, 8)}`;
        const emails: [string] = [`${shortname}@example.com`];

        const { data: fullRegistration } =
          await oryKratosClient.updateRegistrationFlow(
            {
              flow: registrationFlow.id,
              updateRegistrationFlowBody: {
                method: "password",
                password,
                traits: {
                  emails,
                },
              },
            },
            { headers: createTraceHeaders() },
          );

        if (!fullRegistration.session || !fullRegistration.session_token) {
          throw new Error("Registration failed");
        }

        const user = await getUserByKratosIdentityId({
          authentication: { actorId: publicUserAccountId },
          kratosIdentityId: fullRegistration.identity.id,
        });

        if (!user) {
          throw new Error("User not found");
        }

        context.session = {
          token: fullRegistration.session_token,
          expiresAt: fullRegistration.session.expires_at
            ? new Date(fullRegistration.session.expires_at).valueOf()
            : undefined,
          user: {
            email: emails,
            kratosIdentityId: fullRegistration.identity.id,
            password,
          },
          ownedById: extractOwnedByIdFromEntityId(user.entityId),
        };
      },
    },
    {
      name: "Complete registration",
      function: async (context) => {
        if (!context.session) {
          throw new Error("Session not found");
        }
        if (
          context.session.user.shortname !== undefined ||
          context.session.user.displayName !== undefined
        ) {
          throw new Error("User already registered");
        }

        const email = context.session.user.email[0];
        const shortname = email.split("@")[0]!;
        const displayName = `Virtual User ${shortname.split("vu-")[1]!.toUpperCase()}`;

        const kratosIdentityId = context.session.user.kratosIdentityId;

        await completeUserRegistration({
          kratosIdentityId,
          shortname,
          displayName,
        });

        context.session.user.shortname = shortname;
        context.session.user.displayName = displayName;
      },
    },
    {
      name: "Me query",
      function: async (context) => {
        const output = await fetch("http://localhost:5001/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.session?.token}`,
          },
          body: JSON.stringify({
            query: `
                query {
                  me {
                    subgraph {
                      vertices
                    }
                  }
                }
              `,
          }),
        });
      },
    },
  ],
};

const metrics = {
  scenario: {
    started: meter.createCounter("scenario.runs.started", {
      description: "The number of times a scenario was started",
      valueType: ValueType.INT,
    }),
    completed: meter.createHistogram("scenario.runs.completed", {
      description: "The time it took to complete a scenario",
      unit: "ms",
      valueType: ValueType.INT,
    }),
    failed: meter.createCounter("scenario.runs.failed", {
      description: "The number of times a scenario failed",
      valueType: ValueType.INT,
    }),
  },
  step: {
    started: meter.createCounter("step.runs.started", {
      description: "The number of times a step was started",
      valueType: ValueType.INT,
    }),
    completed: meter.createHistogram("step.runs.completed", {
      description: "The time it took to complete a step",
      unit: "ms",
      valueType: ValueType.INT,
    }),
    failed: meter.createCounter("step.runs.failed", {
      description: "The number of times a step failed",
      valueType: ValueType.INT,
    }),
  },
};

const run_step = async (step: StepDefinition, context: Context) => {
  metrics.step.started.add(1, { step: step.name });
  const startTime = Date.now();
  await tracer.startActiveSpan(
    step.name,
    { startTime, kind: SpanKind.CLIENT },
    async (span) => {
      try {
        await step.function(context);
        const endTime = Date.now();
        span.end(endTime);
        metrics.step.completed.record(endTime - startTime, {
          step: step.name,
        });
      } catch (error) {
        console.error(error);
        metrics.step.failed.add(1, { step: step.name });
      }
    },
  );
};

const runScenario = async (scenario: ScenarioDefinition) => {
  metrics.scenario.started.add(1, { scenario: scenario.name });
  const context = {};
  const startTime = Date.now();
  await tracer.startActiveSpan(
    scenario.name,
    { startTime, kind: SpanKind.CLIENT },
    async (span) => {
      try {
        for (const step of scenario.flow) {
          await run_step(step, context);
        }
        const endTime = Date.now();
        span.end(endTime);
        metrics.scenario.completed.record(endTime - startTime, {
          scenario: scenario.name,
        });
      } catch (error) {
        console.error(error);
        metrics.scenario.failed.add(1);
      }
    },
  );
};

// Run `runScenario` 10 times with a 1 second delay between each run, do that 10 times
const promises = [];
for (let i = 0; i < 1; i++) {
  for (let j = 0; j < 10; j++) {
    promises.push(runScenario(scenario));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
await Promise.all(promises);

await metricReader.forceFlush();
// console.log(JSON.stringify(metricExporter.getMetrics(), null, 2));
await sdk.shutdown();
