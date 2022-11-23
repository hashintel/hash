import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import {
  EntityEditionId,
  EntityWithMetadata,
  Subgraph,
} from "@hashintel/hash-subgraph";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";

export type HashInstance = {
  userRegistrationIsDisabled: boolean;
};

export const constructHashInstance = (params: {
  subgraph: Subgraph<EntityWithMetadata>;
  hashInstanceEditionId: EntityEditionId;
}): HashInstance => {
  const { subgraph, hashInstanceEditionId } = params;

  const hashInstanceEntity = getEntityByEditionId(
    subgraph,
    hashInstanceEditionId,
  );

  if (!hashInstanceEntity) {
    throw new Error(
      `An entity with edition ${JSON.stringify(
        hashInstanceEditionId,
      )} could not be found in subgraph.`,
    );
  }

  const { properties } = hashInstanceEntity;

  const userRegistrationIsDisabled = properties[
    extractBaseUri(types.propertyType.userRegistrationIsDisabled.propertyTypeId)
  ] as boolean;

  return {
    userRegistrationIsDisabled,
  };
};
