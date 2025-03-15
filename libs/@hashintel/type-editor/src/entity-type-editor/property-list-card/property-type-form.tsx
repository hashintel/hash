import type { BaseUrl } from "@blockprotocol/type-system";

import { useOntologyFunctions } from "../../shared/ontology-functions-context";
import type { TypeFormProps } from "../shared/type-form";
import { TypeForm } from "../shared/type-form";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";
import type { PropertyTypeFormValues } from "./shared/property-type-form-values";

export const PropertyTypeForm = ({
  baseUrl,
  ...props
}: TypeFormProps<PropertyTypeFormValues> & {
  baseUrl?: BaseUrl;
}) => {
  const ontologyFunctions = useOntologyFunctions();

  if (!ontologyFunctions) {
    return null;
  }

  const validateTitle = async (title: string) =>
    ontologyFunctions.validateTitle({
      kind: "property-type",
      title,
    });

  return (
    <TypeForm kind="property" validateTitle={validateTitle} {...props}>
      <ExpectedValueSelector propertyTypeBaseUrl={baseUrl} />
    </TypeForm>
  );
};
