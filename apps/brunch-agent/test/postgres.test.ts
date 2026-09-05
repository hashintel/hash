import { describe, expect, test, vi } from "vitest";

import {
  type PostgresDatabaseConfig,
  POSTGRES_ENV,
} from "../src/database-config.ts";
import {
  createPostgresPool,
  createPostgresPoolConfig,
  createPostgresRunnerFromPool,
  POSTGRES_CONNECTION_TIMEOUT_MS,
  probeRdsIam,
} from "../src/postgres.ts";

interface TestQueryResult {
  readonly rows: Record<string, unknown>[];
}

const commonConfig = {
  kind: "postgres",
  database: "brunch",
  host: "brunch.example.rds.amazonaws.com",
  port: 5432,
  tlsCaPath: "/run/config/rds-ca.pem",
  user: "brunch_agent",
} as const;

describe("Postgres connection configuration", () => {
  test("generates a fresh IAM token for each password request", async () => {
    const getAuthToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("token-one")
      .mockResolvedValueOnce("token-two");
    const onIamToken = vi.fn<() => void>();
    const config: PostgresDatabaseConfig = {
      ...commonConfig,
      auth: { mode: "iam", region: "eu-central-1" },
    };

    const poolConfig = createPostgresPoolConfig(config, {
      onIamToken,
      readTlsCa: () => "test-ca",
      signerFactory: () => ({ getAuthToken }),
    });
    expect(poolConfig).toMatchObject({
      application_name: "brunch-agent",
      connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
      database: "brunch",
      host: commonConfig.host,
      port: 5432,
      ssl: { ca: "test-ca", rejectUnauthorized: true },
      user: "brunch_agent",
    });
    expect(typeof poolConfig.password).toBe("function");

    const password = poolConfig.password as () => Promise<string>;
    await expect(password()).resolves.toBe("token-one");
    await expect(password()).resolves.toBe("token-two");
    expect(getAuthToken).toHaveBeenCalledTimes(2);
    expect(onIamToken).toHaveBeenCalledTimes(2);
  });

  test("uses the injected password without a signer", () => {
    const signerFactory =
      vi.fn<
        (config: {
          hostname: string;
          port: number;
          region: string;
          username: string;
        }) => { getAuthToken: () => Promise<string> }
      >();
    const config: PostgresDatabaseConfig = {
      ...commonConfig,
      auth: { mode: "password", password: "test-password" },
    };

    const poolConfig = createPostgresPoolConfig(config, {
      readTlsCa: () => "test-ca",
      signerFactory,
    });

    expect(poolConfig.password).toBe("test-password");
    expect(signerFactory).not.toHaveBeenCalled();
  });

  test("reports a missing CA by field name without exposing its path", () => {
    const tlsCaPath = "/private/deployment/secret-ca-path.pem";
    let errorMessage = "";
    try {
      createPostgresPoolConfig({
        ...commonConfig,
        auth: { mode: "password", password: "test-password" },
        tlsCaPath,
      });
    } catch (error) {
      errorMessage = String(error);
    }

    expect(errorMessage).toContain(POSTGRES_ENV.tlsCaPath);
    expect(errorMessage).not.toContain(tlsCaPath);
  });

  test("handles errors emitted by idle pooled clients", async () => {
    const onPoolError = vi.fn<(error: Error) => void>();
    const pool = createPostgresPool(
      {
        ...commonConfig,
        auth: { mode: "password", password: "test-password" },
      },
      { onPoolError, readTlsCa: () => "test-ca" },
    );
    const failure = new Error("idle connection failed");

    expect(() => pool.emit("error", failure, undefined as never)).not.toThrow();
    expect(onPoolError).toHaveBeenCalledWith(failure);
    await pool.end();
  });
});

describe("RDS IAM probe", () => {
  test("releases a checked-out client when the next connection fails", async () => {
    const connectionFailure = new Error("second connection failed");
    const release = vi.fn<() => void>();
    const firstClient = {
      query: async <T>(): Promise<{ rows: T[] }> => ({ rows: [] }),
      release,
    };
    const pool = {
      connect: vi
        .fn<() => Promise<typeof firstClient>>()
        .mockResolvedValueOnce(firstClient)
        .mockRejectedValueOnce(connectionFailure),
      end: vi.fn<() => Promise<void>>(async () => undefined),
    };

    await expect(
      probeRdsIam(
        {
          ...commonConfig,
          auth: { mode: "iam", region: "eu-central-1" },
        },
        { createPool: () => pool },
      ),
    ).rejects.toBe(connectionFailure);

    expect(release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});

describe("Flue Postgres runner", () => {
  test("reports a pool checkout failure", async () => {
    const failure = new Error("connection failed");
    const reportFailure = vi.fn<(error: unknown) => Promise<void>>(
      async () => undefined,
    );
    const pool = {
      connect: vi.fn<() => Promise<never>>(async () => {
        throw failure;
      }),
      end: vi.fn<() => Promise<void>>(async () => undefined),
      query: vi.fn<() => Promise<TestQueryResult>>(),
    };
    const runner = createPostgresRunnerFromPool(pool, undefined, reportFailure);

    await expect(runner.transaction(async () => undefined)).rejects.toBe(
      failure,
    );
    expect(reportFailure).toHaveBeenCalledWith(failure);
  });

  test("pins a successful transaction to one checked-out client", async () => {
    const release = vi.fn<() => void>();
    const client = {
      query: vi.fn<(text: string) => Promise<TestQueryResult>>(
        async (text) => ({
          rows: text === "SELECT value" ? [{ value: 42 }] : [],
        }),
      ),
      release,
    };
    const pool = {
      connect: vi.fn<() => Promise<typeof client>>(async () => client),
      end: vi.fn<() => Promise<void>>(async () => undefined),
      query: vi.fn<() => Promise<TestQueryResult>>(async () => ({
        rows: [{ outside: true }],
      })),
    };
    const runner = createPostgresRunnerFromPool(pool);

    await expect(
      runner.transaction(async (transaction) => {
        const rows = await transaction.query("SELECT value");
        return rows[0]?.value;
      }),
    ).resolves.toBe(42);
    expect(client.query.mock.calls.map(([text]) => text)).toEqual([
      "BEGIN",
      "SELECT value",
      "COMMIT",
    ]);
    expect(pool.query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  test("rolls back and releases the client after failure", async () => {
    const release = vi.fn<() => void>();
    const client = {
      query: vi.fn<(text: string) => Promise<TestQueryResult>>(async () => ({
        rows: [],
      })),
      release,
    };
    const pool = {
      connect: vi.fn<() => Promise<typeof client>>(async () => client),
      end: vi.fn<() => Promise<void>>(async () => undefined),
      query: vi.fn<(text: string) => Promise<TestQueryResult>>(async () => ({
        rows: [],
      })),
    };
    const runner = createPostgresRunnerFromPool(pool);
    const failure = new Error("transaction failed");

    await expect(
      runner.transaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(client.query.mock.calls.map(([text]) => text)).toEqual([
      "BEGIN",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  test("closes Postgres and telemetry through the adapter lifecycle", async () => {
    const closed: string[] = [];
    const pool = {
      connect: vi.fn<() => Promise<never>>(),
      end: vi.fn<() => Promise<void>>(async () => {
        closed.push("postgres");
      }),
      query: vi.fn<(text: string) => Promise<TestQueryResult>>(),
    };
    const runner = createPostgresRunnerFromPool(pool, async () => {
      closed.push("telemetry");
    });

    await runner.close();

    expect(closed).toEqual(["postgres", "telemetry"]);
  });
});
