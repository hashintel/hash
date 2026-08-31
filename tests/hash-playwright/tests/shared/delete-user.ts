const graphAdminPort = process.env.HASH_GRAPH_ADMIN_PORT ?? "4001";
const graphPort = process.env.HASH_GRAPH_HTTP_PORT ?? "4000";

const serviceSecret =
  process.env.HASH_GRAPH_SERVICE_SECRET ?? "hash-svc-local-dev-secret";

/** Reads the system machine from the bootstrap route, which takes the secret and no actor. */
const fetchSystemMachineActorId = async (): Promise<string> => {
  const response = await fetch(
    `http://127.0.0.1:${graphPort}/actors/machine/identifier/system/h`,
    { headers: { Authorization: `HASH-Service ${serviceSecret}` } },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to get the system machine: HTTP ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as string;
};

/**
 * Delete a user (Kratos identity + owned Graph entities + Hydra sessions)
 * via the Graph admin endpoint.
 *
 * Resolves silently when the user does not exist, so it is safe to call as
 * a pre-test cleanup step. Any other error is rethrown.
 *
 * Note: the endpoint intentionally preserves the user's web principal
 * (entity types may be referenced from other webs). Tests that need a
 * fresh shortname should randomise it per run in addition to calling
 * this.
 */
export const deleteUserByEmail = async (email: string): Promise<void> => {
  const response = await fetch(
    `http://127.0.0.1:${graphAdminPort}/users/delete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HASH-Service ${serviceSecret}`,
        "X-Authenticated-User-Actor-Id": await fetchSystemMachineActorId(),
      },
      body: JSON.stringify({ email }),
    },
  );

  if (response.ok || response.status === 404) {
    return;
  }

  const body = await response.text();
  throw new Error(
    `Failed to delete user ${email}: HTTP ${response.status} ${body}`,
  );
};
