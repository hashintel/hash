/**
 * A type respresenting the change message format '2' of the Wal2Json logical decoding
 * plugin for PostgreSQL.
 *
 * Note: We ignore transaction begin / end messages (i.e. those with action "B" / "C"),
 * and TRUNCATE messages (action "T").
 */
export type Wal2JsonMsg = {
  /** The table the change is coming from. */
  table: string;

  /** The schema namespace the `table` belongs to. */
  schema: string;

  /** The type of change: "I" (insert), "U" (update) or "D" (delete). */
  action: "I" | "U" | "D";

  /** Each column in the table row. */
  columns: {
    /** The column name. */
    name: string;

    /** The column type. */
    type: string;

    /** The column value. */
    value: unknown;
  }[];
};
