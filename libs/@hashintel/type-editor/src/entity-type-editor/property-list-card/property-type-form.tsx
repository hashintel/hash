import { BaseUri } from "@blockprotocol/type-system";
import { getPropertyTypeById } from "@blockprotocol/graph/stdlib";

import {
  generateInitialTypeUri,
  TypeForm,
  TypeFormProps,
  useGenerateTypeBaseUri,
} from "../shared/type-form";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";
import { useOntologyFunctions } from "../../shared/ontology-functions-context";

export const PropertyTypeForm = ({
  baseUri,
  ...props
}: TypeFormProps<PropertyTypeFormValues> & {
  baseUri?: BaseUri;
}) => {
  const { getPropertyType } = useOntologyFunctions();
  const generateTypeBaseUri = useGenerateTypeBaseUri("property-type");

  const nameExists = async (name: string) => {
    const propertyTypeId = generateInitialTypeUri(generateTypeBaseUri(name));

    const res = await getPropertyType({
      data: {
        propertyTypeId,
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
