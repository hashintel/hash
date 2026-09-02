/**
 * The deployed conversation-store contract.
 *
 * Production accepts only dedicated Postgres fields. Local development and
 * hermetic tests keep the existing SQLite path, but production can never
 * silently select it.
 */

export const POSTGRES_ENV = {
  authMode: "BRUNCH_POSTGRES_AUTH_MODE",
  awsRegion: "BRUNCH_POSTGRES_AWS_REGION",
  database: "BRUNCH_POSTGRES_DATABASE",
  host: "BRUNCH_POSTGRES_HOST",
  password: "BRUNCH_POSTGRES_PASSWORD",
  port: "BRUNCH_POSTGRES_PORT",
  tlsCaPath: "BRUNCH_POSTGRES_TLS_CA_PATH",
  user: "BRUNCH_POSTGRES_USER",
} as const;

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

type Environment = Readonly<Record<string, string | undefined>>;

const valueOf = (environment: Environment, name: string): string => {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Production database configuration requires ${name}.`);
  }
  return value;
};

const absent = (environment: Environment, name: string): void => {
  if (environment[name] !== undefined) {
    throw new Error(
      `Production database configuration does not accept ${name}.`,
    );
  }
};

const portOf = (environment: Environment): number => {
  const name = POSTGRES_ENV.port;
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

const rejectLegacyProductionInputs = (environment: Environment): void => {
  absent(environment, "DATABASE_URL");
  absent(environment, "BRUNCH_DEV_DB_PATH");
  absent(environment, "BRUNCH_CHAT_DB_PATH");
};

export function loadDatabaseConfig(
  environment: Environment = process.env,
): DatabaseConfig {
  if (environment.NODE_ENV !== "production") {
    return { kind: "sqlite" };
  }

  rejectLegacyProductionInputs(environment);

  const authMode = valueOf(environment, POSTGRES_ENV.authMode);
  const common = {
    kind: "postgres" as const,
    database: valueOf(environment, POSTGRES_ENV.database),
    host: valueOf(environment, POSTGRES_ENV.host),
    port: portOf(environment),
    tlsCaPath: valueOf(environment, POSTGRES_ENV.tlsCaPath),
    user: valueOf(environment, POSTGRES_ENV.user),
  };

  if (authMode === "iam") {
    absent(environment, POSTGRES_ENV.password);
    return {
      ...common,
      auth: {
        mode: "iam",
        region: valueOf(environment, POSTGRES_ENV.awsRegion),
      },
    };
  }

  if (authMode === "password") {
    absent(environment, POSTGRES_ENV.awsRegion);
    return {
      ...common,
      auth: {
        mode: "password",
        password: valueOf(environment, POSTGRES_ENV.password),
      },
    };
  }

  throw new Error(
    `${POSTGRES_ENV.authMode} must be either "iam" or "password".`,
  );
}
