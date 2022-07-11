import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

const aggregationVersionsTableColumns: ColumnDefinitions = {
  source_account_id: {
    type: "uuid",
    comment: "The account id of the source entity",
  },
  aggregation_version_id: {
    type: "uuid",
    comment: "The UUID of the aggregation version",
  },
  aggregation_id: {
    type: "uuid",
    comment: "The UUID of the aggregation",
  },
  operation: {
    type: "jsonb",
    comment: "The aggregation operation",
  },
  updated_at: {
    type: "timestamp with time zone",
    comment: stripNewLines(`
    Versioned aggregations are never mutated, so the updated_at time represents when
    the version was created. Non-versioned aggregations may be mutatated in-place, and the
    updated_at column changes when a mutation is made.
  `),
  },
  updated_by_account_id: {
    type: "uuid",
    comment:
      "The account id of the account that updated (or created) this aggregation version",
  },
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * Step 1. create aggregation_versions table
   */
  pgm.createTable("aggregation_versions", aggregationVersionsTableColumns, {
    ifNotExists: true,
  });

  /**
   * Step 2. populate aggregation_versions table
   */
  pgm.sql(`
    insert into aggregation_versions (
      source_account_id,
      aggregation_id,
      operation,
      updated_at,
      updated_by_account_id
    )
    select
      source_account_id,
      aggregation_id,
      operation,
      created_at,
      created_by_account_id
    from aggregations
    where not exists (
      select aggregation_id
      from aggregation_versions
      where aggregation_versions.aggregation_id = aggregations.aggregation_id
    )
  `);

  pgm.sql(`
    update aggregation_versions
    set aggregation_version_id = gen_random_uuid()
    where aggregation_version_id is null
  `);

  /**
   * Step 3. make all columns in aggregation_versions table non-nullable
   */
  for (const columnName of Object.keys(aggregationVersionsTableColumns)) {
    pgm.alterColumn("aggregation_versions", columnName, { notNull: true });
  }

  /**
   * Step 4. drop the operation column on the aggregations table
   */
  pgm.dropColumn("aggregations", "operation");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(
    "aggregations",
    {
      operation: {
        type: "jsonb",
      },
    },
    { ifNotExists: true },
  );

  pgm.sql(`
    update aggregations
    set
      operation = aggregation_versions.operation
    from aggregation_versions
    where
      aggregations.aggregation_id = aggregation_versions.aggregation_id
      and aggregations.operation is null
  `);

  pgm.dropTable("aggregation_versions", { ifExists: true });
}
