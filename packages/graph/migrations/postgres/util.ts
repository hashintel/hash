import { Uuid4 } from "id128";
import { MigrationBuilder } from "node-pg-migrate";

/**
 * @param db
 * @param params.tableName the name of the column's table
 * @param params.columnName the name of the column
 * @returns `true` if the column exists in the table, otherwise `false`
 */
export const columnDoesNotExists = async (
  db: MigrationBuilder["db"],
  params: {
    tableName: string;
    columnName: string;
  },
): Promise<Boolean> => {
  const { rows } = await db.query(`
    select * 
    from INFORMATION_SCHEMA.COLUMNS 
    where table_name = '${params.tableName}'
    and column_name = '${params.columnName}'
  `);

  return rows.length === 0;
};

export const stripNewLines = (inputString: string) =>
  inputString.replace(/(\r\n|\n|\r)( *)/gm, " ");

/** @todo replace this when implementation in the backend/src/util changes */
export const genId = () => Uuid4.generate().toCanonical().toLowerCase();
