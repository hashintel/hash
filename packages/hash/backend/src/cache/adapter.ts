import { DataSource } from "apollo-datasource";

export interface CacheAdapter extends DataSource {
  /**
   * Get a value from the cache. Returns `null` if not found.
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value in the cache.
   * @todo: add "expiresAt" or "expiresIn" optional argument.
   */
  set(key: string, value: string): Promise<null>;
}
