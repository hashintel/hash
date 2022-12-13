import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { useEffect, useMemo } from "react";
import { FormProvider, UseFormTrigger } from "react-hook-form";
import { useBlockProtocolGetPropertyType } from "../../../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import {
  generateInitialTypeUri,
  TypeFormDescriptionField,
  TypeFormNameField,
  TypeForm,
  TypeFormProps,
  useGenerateTypeBaseUri,
  useTypeForm,
} from "../../shared/type-form";
import { PropertyTypeFormValues } from "./property-type-form-values";
import { ExpectedValueSelector } from "./property-type-form/expected-value-selector";

const useTriggerValidation = (
  defaultValues: Partial<PropertyTypeFormValues>,
  disabledFields: Set<keyof PropertyTypeFormValues>,
  trigger: UseFormTrigger<PropertyTypeFormValues>,
) => {
  const keys = (
    Object.keys(defaultValues) as any as (keyof typeof defaultValues)[]
  ).filter(
    (key) =>
      typeof defaultValues[key] !== "undefined" && !disabledFields.has(key),
  );
  const stringifiedKeys = JSON.stringify(keys);
  const defaultValuesKeys = useMemo(
    () => JSON.parse(stringifiedKeys) as typeof keys,
    [stringifiedKeys],
  );

  useEffect(() => {
    for (const key of defaultValuesKeys) {
      void trigger(key);
    }
  }, [trigger, defaultValuesKeys]);
};

export const PropertyTypeForm = ({
  getDefaultValues,
  fieldProps = {},
  ...props
}: {
  getDefaultValues?: () => Partial<PropertyTypeFormValues>;
  fieldProps?: Partial<
    Record<keyof PropertyTypeFormValues, { disabled?: boolean }>
  >;
} & TypeFormProps<PropertyTypeFormValues>) => {
  const defaultValues = getDefaultValues?.() ?? {};
  const formMethods = useTypeForm<PropertyTypeFormValues>(defaultValues);

  // @todo move into wrapper
  const disabledFields = new Set(
    (Object.keys(fieldProps) as any as (keyof typeof fieldProps)[]).filter(
      (key) => fieldProps[key]?.disabled,
    ),
  );
  useTriggerValidation(defaultValues, disabledFields, formMethods.trigger);

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
    <FormProvider {...formMethods}>
      <TypeForm
        defaultField={defaultValues.name ? "description" : "name"}
        {...props}
      >
        <TypeFormNameField
          fieldDisabled={fieldProps?.name?.disabled ?? false}
          typeExists={nameExists}
        />
        <TypeFormDescriptionField
          defaultValues={defaultValues}
          fieldDisabled={fieldProps.description?.disabled ?? false}
        />
        <ExpectedValueSelector />
      </TypeForm>
    </FormProvider>
  );
};
