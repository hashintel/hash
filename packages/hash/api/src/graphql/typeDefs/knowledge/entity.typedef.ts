import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar EntityId
  scalar EntityEditionId
  scalar Entity
  scalar PropertyObject
  scalar EntityMetadata

  input LinkedEntityDefinition {
    destinationAccountId: ID!
    linkEntityTypeId: VersionedUri!
    """
    The index of the link (if any)
    """
    index: Int
    entity: EntityDefinition!
  }

  input EntityDefinition {
    """
    The EntityId of the existing entity to use instead of creating a new entity.
    This may be a reference to a placeholder set using placeholderId on a previous UpdatePageContentsAction.
    """
    existingEntityId: EntityId
    """
    The type of which to instantiate the new entity.
    """
    entityTypeId: VersionedUri
    """
    The properties of new entity.
    """
    entityProperties: PropertyObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [LinkedEntityDefinition!]
  }

  # TODO: rename these and remove "withMetadata" - https://app.asana.com/0/0/1203157172269854/f
  extend type Query {
    """
    Get a subgraph rooted at all entities at their latest version.
    """
    getAllLatestEntities(
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: Int!
    ): Subgraph!

    """
    Get a subgraph rooted at an entity resolved by its id.
    """
    getEntity(
      """
      The id of the entity.
      """
      entityId: EntityId!
      """
      The version of the entity. Defaults to the latest version.
      """
      entityVersion: String
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: Int!
    ): Subgraph!
  }

  extend type Mutation {
    """
    Create an entity.
    """
    createEntity(
      """
      The owner of the create entity. Defaults to the user calling the mutation.
      """
      ownedById: ID
      """
      The type of which to instantiate the new entity.
      """
      entityTypeId: VersionedUri!
      """
      The properties of new entity.
      """
      properties: PropertyObject!
      """
      Associated Entities to either create/get and link to this entity.
      """
      linkedEntities: [LinkedEntityDefinition!]
    ): Entity!

    """
    Update an entity.
    """
    updateEntity(
      """
      The id of the entity.
      """
      entityId: EntityId!
      """
      The updated properties of the entity.
      """
      updatedProperties: PropertyObject!
    ): Entity!
  }
`;
