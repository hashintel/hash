import { DBAdapter } from "@hashintel/hash-api/src/db";
import { EntityType, User } from "@hashintel/hash-api/src/model";

// Creates entity types for each of the accounts passed in
export const createEntityTypes =
  (db: DBAdapter) =>
  async (accountIds: string[]): Promise<EntityType[]> => {
    const userType = await User.getEntityType(db);
    const userTypeUri = userType.properties.$id;

    const schema: any = {
      title: "Tesk",
      description: "A task, ticket, job, etc",
      properties: {
        assignee: {
          description: "The person assigned to complete the task",
          $ref: userTypeUri,
        }, // @todo make this a relative rather than absolute URL
        collaborators: {
          description: "Everyone involved in the task",
          type: "array",
          items: { $ref: userTypeUri },
        },
        completed: {
          description: "Whether or not the task is completed",
          type: "boolean",
        },
        completedAt: {
          description: "When the task was completed",
          type: "string",
          format: "date-time",
        },
        description: {
          description: "A description of the task",
          type: "string",
        },
        dueAt: {
          description: "When the task is due",
          type: "string",
          format: "date-time",
        },
        name: { description: "The name of the task", type: "string" },
        tags: {
          description: "Tags to categorise the task",
          type: "array",
          items: { type: "string" },
        },
      },
    };

    return Promise.all(
      accountIds.map(async (accountId) => {
        const baseParams = {
          accountId,
          createdByAccountId: accountId,
          updatedByAccountId: accountId,
        };
        let entityType = await EntityType.create(db, {
          schema,
          name: "Tesk",
          description: "A task, ticket, job, etc",
          ...baseParams,
        });

        schema.properties.parent = {
          $ref: entityType.properties.$id,
        };
        schema.properties.dependents = {
          type: "array",
          items: { $ref: entityType.properties.$id },
        };
        schema.properties.dependencies = {
          type: "array",
          items: { $ref: entityType.properties.$id },
        };

        entityType = await entityType.update(db, {
          ...baseParams,
          schema,
        });

        return entityType;
      }),
    );
  };
