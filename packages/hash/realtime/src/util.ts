/** Gets an environment variable. Throws an error if it's not set and a fallback
 * value is not provided. */
export const getRequiredEnv = (name: string, fallback?: string) => {
  if (process.env[name]) {
    return process.env[name] as string;
  }
  if (fallback) {
    return fallback;
  }
  throw new Error(`environment variable ${name} is required`);
};
