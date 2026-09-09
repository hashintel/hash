import assert from "node:assert/strict";
import { connect } from "node:net";

/** Fail closed if launched without an effective process IP policy. This is a
 * negative control, not proof that macOS can filter hostnames or that an allowed
 * provider IP is Anthropic. TLS/SNI and the exact endpoint supply those layers. */
export const assertExternalDenied = async () => {
  const outcome = await new Promise<string>((resolve) => {
    const socket = connect({ host: "192.0.2.1", port: 80 });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve("unexpected-connect");
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve("timeout-not-denial");
    });
    socket.once("error", (error: NodeJS.ErrnoException) =>
      resolve(error.code ?? "unknown"),
    );
  });
  assert.equal(
    outcome,
    "EPERM",
    "Verified OS-level process-tree network guard required",
  );
};
