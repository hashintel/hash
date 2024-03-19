import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { getRoots } from "@local/hash-subgraph/stdlib";

import {
  getEntities,
  modifyEntityAuthorizationRelationships,
} from "../../../knowledge/primitive/entity";
import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Ensure the `hashInstanceAdmins` account group has the `editor` permission on all user entities
   */

  const hashInstanceAdminsAccountGroupId =
    await getHashInstanceAdminAccountGroupId(context, authentication);

  const userEntities = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          {
            equal: [
              { path: ["type(inheritanceDepth = 0)", "baseUrl"] },
              { parameter: systemEntityTypes.user.entityTypeBaseUrl },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      includeDrafts: true,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) => getRoots(subgraph));

  for (const userEntity of userEntities) {
    await modifyEntityAuthorizationRelationships(context, authentication, [
      {
        operation: "touch",
        relationship: {
          resource: {
            kind: "entity",
            resourceId: userEntity.metadata.recordId.entityId,
          },
          relation: "editor",
          subject: {
            kind: "accountGroup",
            subjectId: hashInstanceAdminsAccountGroupId,
          },
        },
      },
    ]);
  }

  return migrationState;
};

export default migrate;
