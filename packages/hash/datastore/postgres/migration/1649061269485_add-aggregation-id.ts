import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { columnDoesNotExists, genId } from "../util";

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
   * Step 2. if the `aggregation_id` column didn't previously exist, genereate UUID
   * values for each existing aggregation.
   */
  if (
    await columnDoesNotExists(pgm.db, {
      tableName: "aggregations",
      columnName: "aggregation_id",
    })
  ) {
    const { rows: previousAggregationRows } = await pgm.db.query(`
      select source_account_id, source_entity_id, path, source_entity_version_ids
      from aggregations
    `);

    for (const aggregation of previousAggregationRows) {
      const {
        source_account_id,
        source_entity_id,
        path,
        source_entity_version_ids,
      } = aggregation as {
        source_account_id: string;
        source_entity_id: string;
        path: string;
        source_entity_version_ids: string[];
      };

      const aggregation_id = genId();

      pgm.sql(`
        update aggregations
        set aggregation_id = '${aggregation_id}'
        where
          source_account_id = '${source_account_id}'
          and source_entity_id = '${source_entity_id}'
          and path = '${path}'
          and (
            source_entity_version_ids <@ array[${source_entity_version_ids
              .map((id) => `'${id}'`)
              .join(", ")}]::uuid[]
            and source_entity_version_ids @> array[${source_entity_version_ids
              .map((id) => `'${id}'`)
              .join(", ")}]::uuid[]
          )
      `);
    }
  }

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
    primaryKey: "aggregation_id",
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
