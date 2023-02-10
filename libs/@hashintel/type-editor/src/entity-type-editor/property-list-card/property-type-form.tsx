import { BaseUri } from "@blockprotocol/type-system";

import { useOntologyFunctions } from "../../shared/ontology-functions-context";
import { TypeForm, TypeFormProps } from "../shared/type-form";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";

export const PropertyTypeForm = ({
  baseUri,
  ...props
}: TypeFormProps<PropertyTypeFormValues> & {
  baseUri?: BaseUri;
}) => {
  const { validateTitle: remoteValidation } = useOntologyFunctions();

  const validateTitle = async (title: string) =>
    remoteValidation({
      kind: "property-type",
      title,
    });

  return (
    <TypeForm validateTitle={validateTitle} {...props}>
      <ExpectedValueSelector propertyTypeBaseUri={baseUri} />
    </TypeForm>
  );
};
