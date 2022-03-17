import { DBLink } from "../../adapter";

import { Connection } from "../types";
import { selectLatestVersionOfLink, mapDBRowsToDBLink } from "./sql/links.util";

export const getLink = async (
  conn: Connection,
  params: { sourceAccountId: string; linkId: string },
): Promise<DBLink | null> => {
  const row = await conn.maybeOne(selectLatestVersionOfLink(params));

  return row ? mapDBRowsToDBLink(row) : null;
};
