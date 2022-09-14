import {
  DataTypeModel,
  EntityTypeModel,
  LinkTypeModel,
  PropertyTypeModel,
} from "../../../model";
import {
  PersistedDataType,
  PersistedEntityType,
  PersistedLinkType,
  PersistedPropertyType,
  PropertyTypeSubgraph,
  EntityTypeSubgraph,
} from "../../apiTypes.gen";

export const dataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataType => ({
  accountId: dataType.accountId,
  dataTypeVersionedUri: dataType.schema.$id,
  dataType: dataType.schema,
});

export const propertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyType => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
});

export const propertyTypeSubgraphToGQL = ({
  propertyType,
  referencedDataTypes,
  referencedPropertyTypes,
}: {
  propertyType: PropertyTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
}): PropertyTypeSubgraph => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
  referencedDataTypes: referencedDataTypes.map(dataTypeModelToGQL),
  referencedPropertyTypes: referencedPropertyTypes.map(propertyTypeModelToGQL),
});

export const linkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkType => ({
  accountId: linkType.accountId,
  linkTypeVersionedUri: linkType.schema.$id,
  linkType: linkType.schema,
});

export const entityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityType => ({
  accountId: entityType.accountId,
  entityTypeVersionedUri: entityType.schema.$id,
  entityType: entityType.schema,
});

export const entityTypeSubgraphToGQL = ({
  entityType,
  referencedDataTypes,
  referencedPropertyTypes,
  referencedLinkTypes,
  referencedEntityTypes,
}: {
  entityType: EntityTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
  referencedLinkTypes: LinkTypeModel[];
  referencedEntityTypes: EntityTypeModel[];
}): EntityTypeSubgraph => ({
  accountId: entityType.accountId,
  entityTypeVersionedUri: entityType.schema.$id,
  entityType: entityType.schema,
  referencedDataTypes: referencedDataTypes.map(dataTypeModelToGQL),
  referencedPropertyTypes: referencedPropertyTypes.map(propertyTypeModelToGQL),
  referencedLinkTypes: referencedLinkTypes.map(linkTypeModelToGQL),
  referencedEntityTypes: referencedEntityTypes.map(entityTypeModelToGQL),
});
