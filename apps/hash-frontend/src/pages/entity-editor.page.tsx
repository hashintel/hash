import { Array, ValueOrArray } from "@blockprotocol/type-system";
import { Button } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypeById,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Container, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { NextPageWithLayout } from "../shared/layout";
import { useAuthenticatedUser } from "./shared/auth-info-context";
import { useBlockProtocolFunctionsWithOntology } from "./type-editor/blockprotocol-ontology-functions-hook";

/**
 * Helper type-guard for determining if a `ValueOrArray` definition is an array or a value.
 */
const isArrayDefinition = <T,>(input: ValueOrArray<T>): input is Array<T> =>
  input &&
  typeof input === "object" &&
  "type" in input &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  input.type === "array";

/**
 * This component is an example usage of the `getEntity` BP function.
 * This is meant to be removed as soon as it's unneeded.
 */
const ExampleUsage = ({ ownedById }: { ownedById: OwnedById }) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const [userSubgraph, setUserSubgraph] = useState<Subgraph<EntityRootType>>();
  const [queryEntitiesSubgraph, setQueryEntitiesSubgraph] =
    useState<Subgraph<EntityRootType>>();

  const [createdEntity, setCreatedEntity] = useState<Entity>();

  const { getEntity, createEntity, archiveEntity, queryEntities } =
    useBlockProtocolFunctionsWithOntology(ownedById);

  useEffect(() => {
    // As an example entity, we are going to use the currently logged in user's entity ID
    const entityId = authenticatedUser.entityRecordId.entityId;

    void getEntity({ data: { entityId } }).then(({ data }) => {
      setUserSubgraph(data);
    });
  }, [authenticatedUser, getEntity]);

  useEffect(() => {
    if (!queryEntitiesSubgraph) {
      void queryEntities({ data: { operation: {} } }).then(({ data }) => {
        setQueryEntitiesSubgraph(data);
      });
    }
  }, [queryEntities, queryEntitiesSubgraph, setQueryEntitiesSubgraph]);

  const entity = userSubgraph ? getRoots(userSubgraph)[0] : undefined;

  const entityType =
    userSubgraph && entity
      ? getEntityTypeById(userSubgraph, entity.metadata.entityTypeId)?.schema
      : undefined;

  // The (top-level) property type IDs defined in the entity type
  const propertyTypeIds = useMemo(
    () =>
      entityType
        ? Object.values(entityType.properties).map((value) =>
            isArrayDefinition(value) ? value.items.$ref : value.$ref,
          )
        : undefined,
    [entityType],
  );

  // The (top-level) property type definitions, referenced in the entity type
  const propertyTypeDefinitions = useMemo(
    () =>
      userSubgraph && propertyTypeIds
        ? propertyTypeIds.map(
            (propertyTypeId) =>
              getPropertyTypeById(userSubgraph, propertyTypeId)?.schema,
          )
        : undefined,
    [userSubgraph, propertyTypeIds],
  );

  const allEntities = useMemo(
    () => (queryEntitiesSubgraph ? getRoots(queryEntitiesSubgraph) : undefined),
    [queryEntitiesSubgraph],
  );

  const handleCreateEntity = async () => {
    await createEntity({
      data: {
        entityTypeId: types.entityType.text.entityTypeId,
        properties: {
          [extractBaseUrl(types.propertyType.tokens.propertyTypeId)]: [],
        },
      },
    }).then(({ data }) => setCreatedEntity(data));
  };

  const handleArchiveCreatedEntity = async () => {
    if (!createdEntity) {
      return;
    }
    await archiveEntity({
      data: { entityId: createdEntity.metadata.recordId.entityId },
    }).then(() => setCreatedEntity(undefined));
  };

  return (
    <Container>
      <Typography>Entity</Typography>
      <Button onClick={handleCreateEntity}>Create Entity</Button>
      {createdEntity ? (
        <>
          <p>Created entity:</p>
          <pre style={{ overflowX: "scroll" }}>
            {JSON.stringify(createdEntity, null, 2)}
          </pre>
          <Button onClick={handleArchiveCreatedEntity}>
            Archive The Created Entity
          </Button>
        </>
      ) : null}
      <pre style={{ overflowX: "scroll" }}>
        {JSON.stringify(entity ?? {}, null, 2)}
      </pre>
      <Typography>Entity type</Typography>
      <pre style={{ overflowX: "scroll" }}>
        {JSON.stringify(entityType ?? {}, null, 2)}
      </pre>
      <Typography>Top-level property type definitions</Typography>
      <pre style={{ overflowX: "scroll" }}>
        {JSON.stringify(propertyTypeDefinitions ?? {}, null, 2)}
      </pre>
      <Typography>Query Entities</Typography>
      <pre style={{ overflowX: "scroll" }}>
        {JSON.stringify(allEntities ?? {}, null, 2)}
      </pre>
    </Container>
  );
};

const ExampleEntityEditorPage: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  return (
    <Container sx={{ pt: 10 }}>
      <ExampleUsage ownedById={authenticatedUser.accountId as OwnedById} />
    </Container>
  );
};

export default ExampleEntityEditorPage;
