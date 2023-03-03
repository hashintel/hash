import { gql } from "apollo-server-express";

export const entityTypedef = gql`
  scalar EntityId
  scalar EntityRecordId
  scalar Entity
  scalar EntityPropertiesObject
  scalar EntityMetadata
  scalar LinkData

  input LinkedEntityDefinition {
    destinationAccountId: AccountId!
    linkEntityTypeId: VersionedUrl!
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
    entityTypeId: VersionedUrl
    """
    The properties of new entity.
    """
    entityProperties: EntityPropertiesObject
    """
    Associated Entities to either create/get and link to this entity.
    """
    linkedEntities: [LinkedEntityDefinition!]
  }

  # TODO: rename these and remove "withMetadata" - https://app.asana.com/0/0/1203157172269854/f
  extend type Query {
    """
    Get a subgraph rooted at all entities that match a given filter.
    """
    queryEntities(
      """
      Filter root entities by their entity type ID (optional)
      """
      rootEntityTypeIds: [VersionedUrl!]
      constrainsValuesOn: OutgoingEdgeResolveDepthInput!
      constrainsPropertiesOn: OutgoingEdgeResolveDepthInput!
      constrainsLinksOn: OutgoingEdgeResolveDepthInput!
      constrainsLinkDestinationsOn: OutgoingEdgeResolveDepthInput!
      isOfType: OutgoingEdgeResolveDepthInput!
      hasLeftEntity: EdgeResolveDepthsInput!
      hasRightEntity: EdgeResolveDepthsInput!
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
      hasRightEntity: EdgeResolveDepthsInput!
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
      ownedById: OwnedById
      """
      The type of which to instantiate the new entity.
      """
      entityTypeId: VersionedUrl!
      """
      The properties of new entity.
      """
      properties: EntityPropertiesObject!
      """
      Associated Entities to either create/get and link to this entity.
      """
      linkedEntities: [LinkedEntityDefinition!]
      """
      The link metadata of the entity (required when creating a link entity).
      """
      linkData: LinkData
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
      updatedProperties: EntityPropertiesObject!
      """
      The updated left to right order of the link entity (if updating a link entity).
      """
      leftToRightOrder: Int
      """
      The updated right to left order of the link entity (if updating a link entity).
      """
      rightToLeftOrder: Int
      """
      The new type of the updated entity
      """
      entityTypeId: VersionedUrl
    ): Entity!

    """
    Archive an entity.
    """
    archiveEntity(
      """
      The id of the entity that will be archived.
      """
      entityId: EntityId!
    ): Boolean!
  }
`;
