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
  readonly tlsCaPath?: string;
  readonly user: string;
}

export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig;

type Environment = Readonly<Record<string, string | undefined>>;
interface DatabaseConfigOptions {
  readonly onWarning?: (message: string) => void;
}

const optionalValueOf = (
  environment: Environment,
  name: string,
): string | undefined => environment[name]?.trim() || undefined;

const valueOf = (environment: Environment, name: string): string => {
  const value = optionalValueOf(environment, name);
  if (value === undefined) {
    throw new Error(`Production database configuration requires ${name}.`);
  }
  return value;
};

const warnIfPresent = (
  environment: Environment,
  name: string,
  onWarning: (message: string) => void,
): void => {
  if (environment[name] !== undefined) {
    onWarning(`${name} is set but ignored by the selected database mode.`);
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

export function loadDatabaseConfig(
  environment: Environment = process.env,
  options: DatabaseConfigOptions = {},
): DatabaseConfig {
  const authMode = optionalValueOf(environment, POSTGRES_ENV.authMode);
  if (authMode === undefined && environment.NODE_ENV !== "production") {
    return { kind: "sqlite" };
  }
  if (authMode === undefined) {
    throw new Error(
      `Production database configuration requires ${POSTGRES_ENV.authMode}.`,
    );
  }
  const onWarning =
    options.onWarning ??
    ((message: string) => {
      // eslint-disable-next-line no-console
      console.warn(message);
    });
  for (const legacyName of [
    "DATABASE_URL",
    "BRUNCH_DEV_DB_PATH",
    "BRUNCH_CHAT_DB_PATH",
  ]) {
    warnIfPresent(environment, legacyName, onWarning);
  }
  const tlsCaPath = optionalValueOf(environment, POSTGRES_ENV.tlsCaPath);
  const common = {
    kind: "postgres" as const,
    database: valueOf(environment, POSTGRES_ENV.database),
    host: valueOf(environment, POSTGRES_ENV.host),
    port: portOf(environment),
    ...(tlsCaPath ? { tlsCaPath } : {}),
    user: valueOf(environment, POSTGRES_ENV.user),
  };

  if (authMode === "iam") {
    warnIfPresent(environment, POSTGRES_ENV.password, onWarning);
    return {
      ...common,
      auth: {
        mode: "iam",
        region: valueOf(environment, POSTGRES_ENV.awsRegion),
      },
    };
  }

  if (authMode === "password") {
    warnIfPresent(environment, POSTGRES_ENV.awsRegion, onWarning);
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
