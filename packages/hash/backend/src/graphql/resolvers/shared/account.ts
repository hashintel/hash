import { DbOrg, DbUser } from "../../../types/dbTypes";

export const isAccount = (
  entity: Record<string, any>
): entity is DbUser | DbOrg =>
  "type" in entity && (entity.type === "User" || entity.type === "Org");
