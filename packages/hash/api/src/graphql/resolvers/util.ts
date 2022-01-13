import { JSONObject } from "blockprotocol";
import { UserInputError } from "apollo-server-express";

import { CreateEntityArgs } from "../../model";
import { isSystemType } from "../../types/entityTypes";
import { exactlyOne } from "../../util";
import { AggregateOperationInput } from "../apiTypes.gen";

// Where a property needs to resolve to another object or objects of a type,
// that property should be expressed as this object under a __linkedData key
// e.g.
// properties: {
//   email: "alice@example.com",
//   employer: { <-- will be resolved to the data requested in __linkedData
//     __linkedData: {
//       entityTypeId: "companyType1",
//       entityId: "c1"
//     }
//   }
// },
export type LinkedDataDefinition = {
  aggregate?: AggregateOperationInput;
  entityTypeId?: string;
  entityId?: string;
  entityVersionId?: string;
};

/**
 * Builds the argument object for the createEntity function. It checks that exactly
 * one of entityTypeId, entityTypeVersionId or systemTypeName is set, and returns
 * the correct variant of CreateEntityArgs.
 */
export const createEntityArgsBuilder = (params: {
  accountId: string;
  createdByAccountId: string;
  properties: JSONObject;
  versioned: boolean;
  entityTypeId?: string | null;
  entityTypeVersionId?: string | null;
  entityId?: string;
  entityVersionId?: string;
  systemTypeName?: string | null;
}): CreateEntityArgs => {
  if (
    !exactlyOne(
      params.entityTypeId,
      params.entityTypeVersionId,
      params.systemTypeName,
    )
  ) {
    throw new UserInputError(
      "exactly one of entityTypeId, entityTypeVersionId or systemTypeName must be provided",
    );
  }

  let args: CreateEntityArgs;
  const _args = {
    accountId: params.accountId,
    createdByAccountId: params.createdByAccountId,
    versioned: params.versioned,
    properties: params.properties,
  };
  if (params.entityTypeId) {
    args = { ..._args, entityTypeId: params.entityTypeId };
  } else if (params.entityTypeVersionId) {
    args = { ..._args, entityTypeVersionId: params.entityTypeVersionId };
  } else if (params.systemTypeName) {
    if (!isSystemType(params.systemTypeName)) {
      throw new UserInputError(
        `Invalid systemTypeName "${params.systemTypeName}"`,
      );
    }
    args = { ..._args, systemTypeName: params.systemTypeName };
  } else {
    throw new Error("unreachable");
  }
  if (params.entityId) {
    args.entityId = params.entityId;
  }
  if (params.entityVersionId) {
    args.entityVersionId = params.entityVersionId;
  }

  return args;
};
