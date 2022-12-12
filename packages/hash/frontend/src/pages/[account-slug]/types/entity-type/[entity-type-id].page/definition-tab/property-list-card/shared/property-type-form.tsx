import { frontendUrl } from "@hashintel/hash-shared/environment";
import { generateBaseTypeId } from "@hashintel/hash-shared/ontology-types";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { bindDialog } from "material-ui-popup-state/hooks";
import { ComponentProps, useEffect, useMemo } from "react";
import { FormProvider, useForm, UseFormTrigger } from "react-hook-form";
import { useBlockProtocolGetPropertyType } from "../../../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetPropertyType";
import { Modal } from "../../../../../../../../components/Modals/Modal";
import { useRouteNamespace } from "../../../../../../shared/use-route-namespace";
import {
  TypeFormDescriptionField,
  TypeFormNameField,
  TypeFormWrapper,
  TypeFormWrapperProps,
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

const generateInitialPropertyTypeId = (baseUri: string) =>
  versionedUriFromComponents(baseUri, 1);

const PropertyTypeFormInner = ({
  getDefaultValues,
  fieldProps = {},
  ...props
}: {
  getDefaultValues?: () => Partial<PropertyTypeFormValues>;
  fieldProps?: Partial<
    Record<keyof PropertyTypeFormValues, { disabled?: boolean }>
  >;
} & TypeFormWrapperProps<PropertyTypeFormValues>) => {
  const defaultValues = getDefaultValues?.() ?? {};

  const formMethods = useForm<PropertyTypeFormValues>({
    defaultValues: {
      name: defaultValues.name ?? "",
      description: defaultValues.description ?? "",
      expectedValues: defaultValues.expectedValues ?? [],
    },
    shouldFocusError: true,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  // @todo move into wrapper
  const disabledFields = new Set(
    (Object.keys(fieldProps) as any as (keyof typeof fieldProps)[]).filter(
      (key) => fieldProps[key]?.disabled,
    ),
  );
  useTriggerValidation(defaultValues, disabledFields, formMethods.trigger);

  const { routeNamespace } = useRouteNamespace();

  const { getPropertyType } = useBlockProtocolGetPropertyType();

  const generatePropertyTypeBaseUriForUser = (value: string) => {
    if (!routeNamespace?.shortname) {
      throw new Error("User shortname must exist");
    }

    return generateBaseTypeId({
      domain: frontendUrl,
      namespace: routeNamespace.shortname,
      kind: "property-type",
      title: value,
    });
  };

  const nameExists = async (name: string) => {
    const propertyTypeId = generateInitialPropertyTypeId(
      generatePropertyTypeBaseUriForUser(name),
    );

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
      <TypeFormWrapper
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
      </TypeFormWrapper>
    </FormProvider>
  );
};

export const PropertyTypeForm = ({
  popupState,
  ...props
}: ComponentProps<typeof PropertyTypeFormInner>) => (
  <Modal
    {...bindDialog(popupState)}
    disableEscapeKeyDown
    contentStyle={(theme) => ({
      p: "0px !important",
      border: 1,
      borderColor: theme.palette.gray[20],
    })}
  >
    <PropertyTypeFormInner {...props} popupState={popupState} />
  </Modal>
);
