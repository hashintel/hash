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
  PropertyTypeRootedSubgraph,
  EntityTypeRootedSubgraph,
} from "../../apiTypes.gen";

export const mapDataTypeModelToGQL = (
  dataType: DataTypeModel,
): PersistedDataType => ({
  accountId: dataType.accountId,
  dataTypeVersionedUri: dataType.schema.$id,
  dataType: dataType.schema,
});

export const mapPropertyTypeModelToGQL = (
  propertyType: PropertyTypeModel,
): PersistedPropertyType => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
});

export const mapPropertyTypeRootedSubgraphToGQL = ({
  propertyType,
  referencedDataTypes,
  referencedPropertyTypes,
}: {
  propertyType: PropertyTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
}): PropertyTypeRootedSubgraph => ({
  accountId: propertyType.accountId,
  propertyTypeVersionedUri: propertyType.schema.$id,
  propertyType: propertyType.schema,
  referencedDataTypes: referencedDataTypes.map(mapDataTypeModelToGQL),
  referencedPropertyTypes: referencedPropertyTypes.map(
    mapPropertyTypeModelToGQL,
  ),
});

export const mapLinkTypeModelToGQL = (
  linkType: LinkTypeModel,
): PersistedLinkType => ({
  accountId: linkType.accountId,
  linkTypeVersionedUri: linkType.schema.$id,
  linkType: linkType.schema,
});

export const mapEntityTypeModelToGQL = (
  entityType: EntityTypeModel,
): PersistedEntityType => ({
  accountId: entityType.accountId,
  entityTypeVersionedUri: entityType.schema.$id,
  entityType: entityType.schema,
});

export const mapEntityTypeRootedSubgraphToGQL = (params: {
  entityType: EntityTypeModel;
  referencedDataTypes: DataTypeModel[];
  referencedPropertyTypes: PropertyTypeModel[];
  referencedLinkTypes: LinkTypeModel[];
  referencedEntityTypes: EntityTypeModel[];
}): EntityTypeRootedSubgraph => ({
  accountId: params.entityType.accountId,
  entityTypeVersionedUri: params.entityType.schema.$id,
  entityType: params.entityType.schema,
  referencedDataTypes: params.referencedDataTypes.map(mapDataTypeModelToGQL),
  referencedPropertyTypes: params.referencedPropertyTypes.map(
    mapPropertyTypeModelToGQL,
  ),
  referencedLinkTypes: params.referencedLinkTypes.map(mapLinkTypeModelToGQL),
  referencedEntityTypes: params.referencedEntityTypes.map(
    mapEntityTypeModelToGQL,
  ),
});
