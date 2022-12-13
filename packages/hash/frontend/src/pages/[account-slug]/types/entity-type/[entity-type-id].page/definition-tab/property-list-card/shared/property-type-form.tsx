import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { useBlockProtocolGetPropertyType } from "../../../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import {
  generateInitialTypeUri,
  GenericTypeForm,
  GenericTypeFormProps,
  useGenerateTypeBaseUri,
} from "../../shared/type-form";
import { PropertyTypeFormValues } from "./property-type-form-values";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";

export const PropertyTypeForm = (
  props: GenericTypeFormProps<PropertyTypeFormValues>,
) => {
  const { getPropertyType } = useBlockProtocolGetPropertyType();
  const generateTypeBaseUri = useGenerateTypeBaseUri("property-type");

  const nameExists = async (name: string) => {
    const propertyTypeId = generateInitialTypeUri(generateTypeBaseUri(name));

    const res = await getPropertyType({
      data: {
        propertyTypeId,
        graphResolveDepths: {
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 0 },
        },
      },
    });

    return !res.data || !!getPropertyTypeById(res.data, propertyTypeId);
  };

  return (
    <GenericTypeForm nameExists={nameExists} {...props}>
      <ExpectedValueSelector />
    </GenericTypeForm>
  );
};
