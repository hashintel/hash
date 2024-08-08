import type { BeforeRequestFn } from "../types";
import type { SessionContext } from "./kratos";
import { reauthenticate } from "./reauthenticate";

export const refreshSessionToken: BeforeRequestFn<SessionContext> = async (
  request,
  context,
  events,
) => {
  if (!context.vars.session) {
    throw new Error("Session not found");
  }

  if (
    context.vars.session.expiresAt &&
    context.vars.session.expiresAt < Date.now()
  ) {
    const startTime = Date.now();
    context.vars.session = await reauthenticate(context.vars.session);
    const timeAfterReauthentication = Date.now();
    events.emit("counter", "kratos.reauthenticate", 1);
    events.emit(
      "histogram",
      "kratos.reauthenticate_time",
      timeAfterReauthentication - startTime,
    );
  }

  request.headers ??= {};
  request.headers.Authorization = `Bearer ${context.vars.session.token}`;
};
