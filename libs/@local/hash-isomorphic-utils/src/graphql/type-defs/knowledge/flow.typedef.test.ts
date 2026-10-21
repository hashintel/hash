import {
  buildASTSchema,
  concatAST,
  getNamedType,
  isInterfaceType,
  isObjectType,
  parse,
  validate,
} from "graphql";
import { describe, expect, it } from "vitest";

import { schema as typeDefs } from "../schema.js";

import type { GraphQLObjectType } from "graphql";

const schema = buildASTSchema(concatAST(typeDefs));

const selectAllFields = (type: GraphQLObjectType): string =>
  Object.values(type.getFields())
    .map((field) => {
      const namedType = getNamedType(field.type);
      return isObjectType(namedType)
        ? `${field.name} { ${selectAllFields(namedType)} }`
        : field.name;
    })
    .join(" ");

describe("FlowRunEvent", () => {
  it("lets one query select every field of every event kind without aliases", () => {
    const eventInterface = schema.getType("FlowRunEvent");
    if (!isInterfaceType(eventInterface)) {
      throw new Error("FlowRunEvent isn't an interface");
    }

    const fragments = schema
      .getPossibleTypes(eventInterface)
      .map((kind) => `... on ${kind.name} { ${selectAllFields(kind)} }`);

    const query = parse(`
      query ($flowRunEntityId: EntityId!) {
        getFlowRunById(flowRunEntityId: $flowRunEntityId) {
          events { events { ${fragments.join(" ")} } }
        }
      }
    `);

    expect(fragments.length).toBeGreaterThan(1);
    expect(validate(schema, query).map(({ message }) => message)).toEqual([]);
  });
});
