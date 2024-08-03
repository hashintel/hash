import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import opentelemetry from "@opentelemetry/api";
import { v4 as uuid } from "uuid";

import {
  completeUserRegistration,
  getUserByKratosIdentityId,
} from "../graph/user";
import type { TracingContext } from "../tracing/sdk";
import { startSpan } from "../tracing/sdk";
import type { ActionFn } from "../types";
import type { SessionContext } from "./kratos";
import { getOryKratosClient } from "./kratos";

export const signupUser: ActionFn<SessionContext, TracingContext> = async (
  context,
  events,
) =>
  startSpan("signup-user", context, async () => {
    const startTime = Date.now();
    const oryKratosClient = getOryKratosClient();
    const tracer = opentelemetry.trace.getTracer(
      "@tests/hash-backend-performance/authentication/registration",
    );
    const headers = {};
    opentelemetry.propagation.inject(opentelemetry.context.active(), headers);

    const registrationFlow = await tracer.startActiveSpan(
      "create-registration-flow",
      async (span) => {
        const flow = await oryKratosClient
          .createNativeRegistrationFlow({}, { headers })
          .then(({ data }) => data);
        span.end();
        return flow;
      },
    );

    // We either use the VU uuid or a new one if it is not available (e.g. in the case of a global account creation)
    const baseName = context.scenario.$uuid ?? uuid();
    const password = baseName;

    const shortname = `vu-${baseName.substring(0, 8)}`;
    const emails: [string] = [`${shortname}@example.com`];

    const fullRegistration = await tracer.startActiveSpan(
      "update-registration-flow",
      async (span) => {
        const registration = await oryKratosClient
          .updateRegistrationFlow(
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
            { headers },
          )
          .then(({ data }) => data);
        span.end();
        return registration;
      },
    );

    const timeAfterUpdateFlow = Date.now();
    events.emit("counter", "kratos.signup", 1);
    events.emit(
      "histogram",
      "kratos.signup_time",
      timeAfterUpdateFlow - startTime,
    );

    if (!fullRegistration.session || !fullRegistration.session_token) {
      throw new Error("Registration failed");
    }

    const user = await tracer.startActiveSpan(
      "get-user-by-kratos-identity-id",
      async (span) => {
        const userEntity = await getUserByKratosIdentityId({
          authentication: { actorId: publicUserAccountId },
          kratosIdentityId: fullRegistration.identity.id,
        });
        span.end();
        return userEntity;
      },
    );
    if (!user) {
      throw new Error("User not found");
    }

    context.vars.session = {
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
  });

export const completeRegistration: ActionFn<
  SessionContext,
  TracingContext
> = async (context, events) =>
  startSpan("complete-registration", context, async () => {
    if (!context.vars.session) {
      throw new Error("Session not found");
    }
    if (
      context.vars.session.user.shortname !== undefined ||
      context.vars.session.user.displayName !== undefined
    ) {
      throw new Error("User already registered");
    }

    const email = context.vars.session.user.email[0];
    const shortname = email.split("@")[0]!;
    const displayName = `Virtual User ${shortname.split("vu-")[1]!.toUpperCase()}`;

    const kratosIdentityId = context.vars.session.user.kratosIdentityId;

    const startTime = Date.now();
    await completeUserRegistration({
      kratosIdentityId,
      shortname,
      displayName,
    });
    const endTime = Date.now();
    events.emit("counter", "graph.complete_registration", 1);
    events.emit(
      "histogram",
      "graph.complete_registration_time",
      endTime - startTime,
    );

    context.vars.session.user.shortname = shortname;
    context.vars.session.user.displayName = displayName;
  });
