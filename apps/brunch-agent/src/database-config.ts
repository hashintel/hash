/**
 * The deployed conversation-store contract.
 *
 * Production requires Postgres. Local development and tests default to SQLite
 * unless BRUNCH_DB_KIND explicitly selects Postgres with the same dedicated
 * fields and TLS/authentication requirements.
 */

import { brunchEnv } from "@hashintel/brunch-agent";

export interface SqliteDatabaseConfig {
  readonly kind: "sqlite";
}

export interface PostgresDatabaseConfig {
  readonly kind: "postgres";
  readonly auth:
    | {
        readonly mode: "iam";
        readonly region: string;
      }
    | {
        readonly mode: "password";
        readonly password: string;
      };
  readonly database: string;
  readonly host: string;
  readonly port: number;
  readonly tlsCaPath: string;
  readonly user: string;
}

export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig;

const valueOf = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Postgres database configuration requires ${name}.`);
  }
  return value;
};

const absent = (environment: NodeJS.ProcessEnv, name: string): void => {
  if (environment[name] !== undefined) {
    throw new Error(`Database configuration does not accept ${name}.`);
  }
};

const portOf = (environment: NodeJS.ProcessEnv): number => {
  const name = brunchEnv.postgres.port;
  const source = valueOf(environment, name);
  if (!/^\d+$/u.test(source)) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  const port = Number(source);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
};

const rejectLegacyPostgresInputs = (environment: NodeJS.ProcessEnv): void => {
  absent(environment, "DATABASE_URL");
  absent(environment, brunchEnv.devDbPath);
  absent(environment, brunchEnv.chatDbPath);
};

export const loadDatabaseConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConfig => {
  const production = environment.NODE_ENV === "production";
  const kind =
    environment[brunchEnv.dbKind] ?? (production ? "postgres" : "sqlite");
  if (kind !== "sqlite" && kind !== "postgres") {
    throw new Error(
      `${brunchEnv.dbKind} must be either "sqlite" or "postgres".`,
    );
  }
  if (kind === "sqlite") {
    if (production) {
      throw new Error(`${brunchEnv.dbKind} must be "postgres" in production.`);
    }
    for (const name of Object.values(brunchEnv.postgres)) {
      absent(environment, name);
    }
    return { kind };
  }

  rejectLegacyPostgresInputs(environment);

  const authMode = valueOf(environment, brunchEnv.postgres.authMode);
  const common = {
    kind: "postgres" as const,
    database: valueOf(environment, brunchEnv.postgres.database),
    host: valueOf(environment, brunchEnv.postgres.host),
    port: portOf(environment),
    tlsCaPath: valueOf(environment, brunchEnv.postgres.tlsCaPath),
    user: valueOf(environment, brunchEnv.postgres.user),
  };

  if (authMode === "iam") {
    absent(environment, brunchEnv.postgres.password);
    return {
      ...common,
      auth: {
        mode: "iam",
        region: valueOf(environment, brunchEnv.postgres.awsRegion),
      },
    };
  }

  if (authMode === "password") {
    absent(environment, brunchEnv.postgres.awsRegion);
    return {
      ...common,
      auth: {
        mode: "password",
        password: valueOf(environment, brunchEnv.postgres.password),
      },
    };
  }

  throw new Error(
    `${brunchEnv.postgres.authMode} must be either "iam" or "password".`,
  );
};
