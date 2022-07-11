import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

const addedAggregationsTableColumns = {
  applied_to_source_at: {
    type: "timestamp with time zone",
    comment: stripNewLines(`
    The timestamp when the aggregation was applied to the source entity (i.e. when
    it was created)
  `),
  },
  applied_to_source_by_account_id: {
    type: "uuid",
    comment: "The account_id of the account which created the aggregation",
  },
  removed_from_source_at: {
    type: "timestamp with time zone",
    comment: stripNewLines(`
    The timestamp when the aggregation was removed from the source entity, if at
    all (i.e. when it was deleted)
  `),
  },
  removed_from_source_by_account_id: {
    type: "uuid",
    comment: "The account_id of the account which deleted the aggregation",
  },
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  /**
   * Step 1. add the applied_to_source_at/by_account_id and removed_from_source_at/by_account_id columns
   */
  pgm.addColumns("aggregations", addedAggregationsTableColumns, {
    ifNotExists: true,
  });

  /**
   * Step 2. populate applied_to_source_at/by_account_id for existing aggregations
   */
  pgm.sql(`
    update aggregations
    set
      applied_to_source_at = (
        select entity_versions.updated_at
        from entity_versions
        where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
        order by entity_versions.updated_at
        asc
        limit 1
      )
    where applied_to_source_at is null
  `);
  pgm.sql(`
    update aggregations
    set
      applied_to_source_by_account_id = (
        select entity_versions.updated_by_account_id
        from entity_versions
        where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
        order by entity_versions.updated_at
        asc
        limit 1
      )
    where applied_to_source_by_account_id is null
  `);

  /**
   * Step 3. populate removed_from_source_at/by_account_id for existing aggregations
   */
  pgm.sql(`
   update aggregations
   set
    removed_from_source_at = (
      select entity_versions.updated_at
      from entity_versions
      where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
      order by entity_versions.updated_at
      desc
      limit 1
    ),
    removed_from_source_by_account_id = (
      select entity_versions.updated_by_account_id
      from entity_versions
      where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
      order by entity_versions.updated_at
      desc
      limit 1
    )
    where
        removed_from_source_at is null
      and (
        select entity_versions.entity_version_id
        from entity_versions
        where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
        order by entity_versions.updated_at
        desc
        limit 1
      ) != (
        select entity_versions.entity_version_id
        from entity_versions, aggregations
        where
          entity_id = (
            select entity_versions.entity_id
            from entity_versions
            where entity_versions.entity_version_id = ANY(aggregations.source_entity_version_ids)
            order by entity_versions.updated_at
            desc
            limit 1
          )
        order by entity_versions.updated_at
        desc
        limit 1
      )
 `);

  /**
   * Step 4. make applied_to_source_at/by_account_id fields non-nullable
   */
  pgm.alterColumn("aggregations", "applied_to_source_at", { notNull: true });
  pgm.alterColumn("aggregations", "applied_to_source_by_account_id", {
    notNull: true,
  });

  /**
   * Step 5. drop the source_entity_version_ids column
   */
  pgm.dropColumns(
    "aggregations",
    ["source_entity_version_ids", "created_at", "created_by_account_id"],
    { ifExists: true },
  );
}

/**
 * Implementing a down migration that wouldn't incur dataloss is possible, but
 * would involve significant effort deemed out of scope at this stage of the project.
 * It will be left unimplemented.
 */
export const down = false;
