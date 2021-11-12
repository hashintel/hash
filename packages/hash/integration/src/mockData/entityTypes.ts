import { DBAdapter } from "@hashintel/hash-api/src/db";
import { EntityType, User } from "@hashintel/hash-api/src/model";

// Creates entity types for each of the accounts passed in
export const createEntityTypes =
  (db: DBAdapter) =>
  async (accountIds: string[]): Promise<EntityType[]> => {
    const userType = await User.getEntityType(db);
    const userTypeUri = userType.properties.$id;

    const taskSchema = {
      name: "Task",
      description: "A task, ticket, job, etc",
      schema: {
        properties: {
          assignee: { $ref: userTypeUri },
          collaborators: { type: "array", items: { $ref: userTypeUri } },
          completed: { type: "boolean" },
          completedAt: { type: "string", format: "date-time" },
          description: { type: "string" },
          dueAt: { type: "string", format: "date-time" },
          name: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    };

    return Promise.all(
      accountIds.map(async (accountId) => {
        return EntityType.create(db, {
          ...taskSchema,
          accountId,
          createdById: accountId,
        });
        // @todo add parent, dependencies, descendents properties with a $ref of the task type's $id.
        //    once EntityType.update is implemented
      }),
    );
  };
