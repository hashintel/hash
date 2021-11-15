import { DataSource } from "apollo-datasource";

export interface CacheAdapter extends DataSource {
  /**
   * Get a value from the cache.
   * @returns the value, or `null` if it's not found.
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a value in the cache.
   * @todo: add "expiresAt" or "expiresIn" optional argument.
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Push one or more values onto the end of a list.
   * @returns the new length of the list.
   * */
  rpush(key: string, ...values: string[]): Promise<number>;
}
