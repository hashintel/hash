import { BaseUri } from "@blockprotocol/type-system";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";

import { useBlockProtocolGetPropertyType } from "../../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-property-type";
import {
  generateInitialTypeUri,
  TypeForm,
  TypeFormProps,
  useGenerateTypeBaseUri,
} from "../shared/type-form";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";

export const PropertyTypeForm = ({
  baseUri,
  ...props
}: TypeFormProps<PropertyTypeFormValues> & {
  baseUri?: BaseUri;
}) => {
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

    if (!res.data) {
      // @todo consider non-crash error handling
      throw new Error("Unable to check whether name is available");
    }

    return !!getPropertyTypeById(res.data, propertyTypeId);
  };

  return (
    <TypeForm nameExists={nameExists} {...props}>
      <ExpectedValueSelector propertyTypeBaseUri={baseUri} />
    </TypeForm>
  );
};
