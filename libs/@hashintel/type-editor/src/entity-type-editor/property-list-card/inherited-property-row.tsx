import { usePropertyTypesOptions } from "../../shared/property-types-options-context";
import { InheritedValues } from "../shared/use-inherited-values";
import { PropertyRow } from "./property-row";

export const InheritedPropertyRow = ({
  inheritedPropertyData,
}: {
  inheritedPropertyData: InheritedValues["properties"][0];
}) => {
  const { $id, inheritanceChain, required, array } = inheritedPropertyData;

  const propertyTypeOptions = usePropertyTypesOptions();
  const propertySchema = propertyTypeOptions[$id]?.schema;

  if (!propertySchema) {
    throw new Error(`Inherited property type ${$id} not found`);
  }

  return (
    <PropertyRow
      inheritanceChain={inheritanceChain}
      property={propertySchema}
      isArray={array}
      isRequired={required}
    />
  );
};
