import { DBAdapter } from "src/db";
import { UserProperties, User as GQLUser } from "../graphql/apiTypes.gen";
import Entity, { EntityConstructorArgs } from "./entity.model";

type UserConstructorArgs = {
  properties: UserProperties;
} & Omit<EntityConstructorArgs, "type">;

class User extends Entity {
  properties: UserProperties;
  type: "User";

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({
      ...remainingArgs,
      properties,
      type: "User",
    });
    this.properties = properties;
    this.type = "User";
  }

  static getUserById =
    (db: DBAdapter) =>
    ({ id }: { id: string }): Promise<User | null> =>
      db
        .getUserById({ id })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  toGQLUser = (): GQLUser => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default User;
