import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";
import { stripNewLines } from "../util";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("links", "destination_entity_version_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("links", {
    destination_entity_version_id: {
      type: "uuid",
      comment: stripNewLines(`
          The entity version id of a specific version of the link's destination
          entity which is defined only if this link is pinned to a specific version
          of the destination entity. When set to null, the link is to the latest
          version of the destination entity.
        `),
    },
  });
}
