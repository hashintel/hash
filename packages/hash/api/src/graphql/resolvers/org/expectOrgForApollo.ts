import { ApolloError } from "apollo-server-errors";
import { Org } from "../../../model";
import { DbClient } from "../../../db";

export async function expectOrgForApollo(
  db: DbClient,
  options: { entityId: string },
): Promise<Org> {
  const org = await Org.getOrgById(db, { entityId: options.entityId });
  if (!org) {
    throw new ApolloError(
      `Org with entityId ${options.entityId} not found in datastore`,
      "NOT_FOUND",
    );
  }
  return org;
}
