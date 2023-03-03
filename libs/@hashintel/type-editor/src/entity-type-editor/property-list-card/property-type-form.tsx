import { BaseUrl } from "@blockprotocol/type-system/slim";

import { useOntologyFunctions } from "../../shared/ontology-functions-context";
import { TypeForm, TypeFormProps } from "../shared/type-form";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";
import { PropertyTypeFormValues } from "./shared/property-type-form-values";

export const PropertyTypeForm = ({
  baseUrl,
  ...props
}: TypeFormProps<PropertyTypeFormValues> & {
  baseUrl?: BaseUrl;
}) => {
  const { validateTitle: remoteValidation } = useOntologyFunctions();

  const validateTitle = async (title: string) =>
    remoteValidation({
      kind: "property-type",
      title,
    });

  return (
    <TypeForm validateTitle={validateTitle} {...props}>
      <ExpectedValueSelector propertyTypeBaseUrl={baseUrl} />
    </TypeForm>
  );
};
