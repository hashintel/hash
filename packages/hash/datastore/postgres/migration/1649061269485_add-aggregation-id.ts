import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * Step 1. add the `aggregation_id` column if it doesn't already exist.
   */
  pgm.addColumn(
    "aggregations",
    {
      aggregation_id: {
        type: "uuid",
        unique: true,
      },
    },
    {
      ifNotExists: true,
    },
  );

  /**
   * Step 2. genereate UUID values for each existing aggregation.
   */
  pgm.sql(`
   update aggregations 
   set aggregation_id = gen_random_uuid()
   where aggregation_id is null
 `);

  /**
   * Step 3. make the `aggregation_id` column non-nullable
   */
  pgm.alterColumn("aggregations", "aggregation_id", {
    notNull: true,
  });

  /**
   * Step 4. replace existing primary key for the `aggregations` table
   */
  pgm.dropConstraint("aggregations", "aggregations_pkey", { ifExists: true });
  pgm.addConstraint("aggregations", "aggregations_pkey", {
    primaryKey: ["source_account_id", "aggregation_id"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("aggregations", "aggregations_pkey", { ifExists: true });
  pgm.addConstraint("aggregations", "aggregations_pkey", {
    primaryKey: [
      "source_account_id",
      "source_entity_id",
      "path",
      "source_entity_version_ids",
    ],
  });

  pgm.dropColumn("aggregations", "aggregation_id");
}
