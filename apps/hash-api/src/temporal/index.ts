import { Logger } from "@local/hash-backend-utils/logger";
import { Client as TemporalClient, Connection } from "@temporalio/client";

export { Client as TemporalClient } from "@temporalio/client";

export const createTemporalClient = async (
  _logger: Logger,
  { host, port, namespace }: { host: string; port: number; namespace: string },
) => {
  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  return new TemporalClient({ connection, namespace });
};
