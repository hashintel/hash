import { DBAdapter } from "src/db";
import { genId } from "src/util";
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

  static create =
    (db: DBAdapter) =>
    async (properties: UserProperties): Promise<User> => {
      const id = genId();

      const entity = await db.createEntity({
        accountId: id,
        entityId: id,
        createdById: id, // Users "create" themselves
        type: "User",
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User({ id, ...entity });
    };

  toGQLUser = (): GQLUser => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default User;
