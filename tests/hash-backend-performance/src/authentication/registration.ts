import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { v4 as uuid } from "uuid";

import {
  completeUserRegistration,
  getUserByKratosIdentityId,
} from "../graph/user";
import type { ActionFn } from "../types";
import type { SessionContext } from "./kratos";
import { getOryKratosClient } from "./kratos";

export const signupUser: ActionFn<SessionContext> = async (context, events) => {
  const startTime = Date.now();
  const oryKratosClient = getOryKratosClient();

  const registrationFlow = await oryKratosClient
    .createNativeRegistrationFlow()
    .then(({ data }) => data);

  // We either use the VU uuid or a new one if it is not available (e.g. in the case of a global account creation)
  const baseName = context.scenario.$uuid ?? uuid();
  const password = baseName;

  const shortname = `vu-${baseName.substring(0, 8)}`;
  const emails: [string] = [`${shortname}@example.com`];

  const fullRegistration = await oryKratosClient
    .updateRegistrationFlow({
      flow: registrationFlow.id,
      updateRegistrationFlowBody: {
        method: "password",
        password,
        traits: {
          emails,
        },
      },
    })
    .then(({ data }) => data);
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

  const user = await getUserByKratosIdentityId({
    authentication: { actorId: publicUserAccountId },
    kratosIdentityId: fullRegistration.identity.id,
  });
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
};

export const completeRegistration: ActionFn<SessionContext> = async (
  context,
  events,
) => {
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

  const startTime = Date.now();
  await completeUserRegistration({
    kratosIdentityId: context.vars.session.user.kratosIdentityId,
    shortname,
    displayName,
  });
  const afterCompleteRegistration = Date.now();
  events.emit("counter", "graph.complete_registration", 1);
  events.emit(
    "histogram",
    "graph.complete_registration_time",
    afterCompleteRegistration - startTime,
  );

  context.vars.session.user.shortname = shortname;
  context.vars.session.user.displayName = displayName;
};
