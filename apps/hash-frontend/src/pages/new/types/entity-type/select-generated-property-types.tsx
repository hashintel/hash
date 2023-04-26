import { PropertyType } from "@blockprotocol/type-system";
import {
  BaseUrl,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph/.";
import { getPropertyTypesByBaseUrl } from "@local/hash-subgraph/stdlib";
import {
  Checkbox,
  CircularProgress,
  Collapse,
  FormControl,
  FormControlLabel,
  formControlLabelClasses,
  FormGroup,
  FormLabel,
  Typography,
} from "@mui/material";
import { Box } from "@mui/system";
import { debounce } from "lodash";
import {
  ChangeEvent,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWatch } from "react-hook-form";

import { useBlockProtocolQueryPropertyTypes } from "../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
import { useAgentRunner } from "../../../../components/hooks/use-agent-runner";
import { useGenerateTypeUrlsForUser } from "../../../shared/use-generate-type-urls-for-user";
import { CreateEntityTypeFormData } from "../entity-type.page";

export type PropertyTypeDefinition = {
  title: string;
  description: string;
  dataType: "text" | "number" | "boolean";
};

type SelectGeneratedPropertyTypesProps = {
  onSelectedPropertiesChange: (
    propertyDefinitions: (PropertyTypeDefinition | PropertyType)[],
  ) => void;
};

export const SelectGeneratedPropertyTypes: FunctionComponent<
  SelectGeneratedPropertyTypesProps
> = ({ onSelectedPropertiesChange }) => {
  const entityTypeTitle = useWatch<CreateEntityTypeFormData>({ name: "name" });
  const entityTypeDescription = useWatch<CreateEntityTypeFormData>({
    name: "description",
  });

  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

  const [generatePropertyTypes, { loading }] = useAgentRunner(
    "generate-entity-type-property-types",
  );

  const [
    generatedPropertyTypeDefinitions,
    setGeneratedPropertyTypeDefinitions,
  ] =
    useState<
      { definition: PropertyTypeDefinition | PropertyType; selected: boolean }[]
    >();

  const [allPropertyTypes, setAllPropertyTypes] = useState<Subgraph>();

  useEffect(() => {
    void (async () => {
      if (!allPropertyTypes) {
        const { data: propertyTypesSubgraph } = await queryPropertyTypes({
          data: {},
        });

        if (!propertyTypesSubgraph) {
          throw new Error(
            "Could not query property types to get all property types.",
          );
        }

        setAllPropertyTypes(propertyTypesSubgraph);
      }
    })();
  }, [allPropertyTypes, queryPropertyTypes]);

  const getLatestPropertyType = useCallback(
    (params: { propertyTypeBaseUrl: BaseUrl }): PropertyType | null => {
      if (!allPropertyTypes) {
        throw new Error("All property types need to be fetched");
      }

      const propertyTypes = getPropertyTypesByBaseUrl(
        allPropertyTypes,
        params.propertyTypeBaseUrl,
      );

      if (!propertyTypes[0]) {
        return null;
      }

      return propertyTypes.reduce<PropertyTypeWithMetadata>(
        (latest, propertyType) =>
          propertyType.metadata.recordId.version >
          latest.metadata.recordId.version
            ? propertyType
            : latest,
        propertyTypes[0],
      ).schema;
    },
    [allPropertyTypes],
  );

  const debouncedGeneratePropertyTypes = useMemo(
    () =>
      debounce(
        async (params: {
          entityTypeTitle: string;
          entityTypeDescription: string;
        }) => {
          const { output } = await generatePropertyTypes(params);

          if (output) {
            const propertyTypeDefinitions: (
              | PropertyTypeDefinition
              | PropertyType
            )[] = [];

            for (const definition of output.propertyTypeDefinitions) {
              const { baseUrl: propertyTypeBaseUrl } = generateTypeUrlsForUser({
                kind: "property-type",
                title: definition.title,
                version: 1,
              });

              const existingPropertyType = getLatestPropertyType({
                propertyTypeBaseUrl,
              });

              propertyTypeDefinitions.push(existingPropertyType ?? definition);
            }

            setGeneratedPropertyTypeDefinitions(
              propertyTypeDefinitions.map((definition) => ({
                definition,
                selected: false,
              })),
            );
          }
        },
        1000,
      ),
    [generateTypeUrlsForUser, generatePropertyTypes, getLatestPropertyType],
  );

  useEffect(() => {
    if (entityTypeTitle && entityTypeDescription) {
      void debouncedGeneratePropertyTypes({
        entityTypeTitle,
        entityTypeDescription,
      });
    }
  }, [entityTypeTitle, entityTypeDescription, debouncedGeneratePropertyTypes]);

  const handlePropertyTypeCheckboxChange = ({
    target,
  }: ChangeEvent<HTMLInputElement>) => {
    if (generatedPropertyTypeDefinitions) {
      const existingPropertyTypeDefinitionIndex =
        generatedPropertyTypeDefinitions.findIndex(
          ({ definition: { title } }) => title === target.name,
        );

      const propertyTypeDefinition =
        generatedPropertyTypeDefinitions[existingPropertyTypeDefinitionIndex];

      const updatedSelectedPropertyTypes = propertyTypeDefinition
        ? [
            ...generatedPropertyTypeDefinitions.slice(
              0,
              existingPropertyTypeDefinitionIndex,
            ),
            {
              ...propertyTypeDefinition,
              selected: !propertyTypeDefinition.selected,
            },
            ...generatedPropertyTypeDefinitions.slice(
              existingPropertyTypeDefinitionIndex + 1,
            ),
          ]
        : generatedPropertyTypeDefinitions;

      setGeneratedPropertyTypeDefinitions(updatedSelectedPropertyTypes);

      onSelectedPropertiesChange(
        updatedSelectedPropertyTypes
          .filter(({ selected }) => selected)
          .map(({ definition }) => definition),
      );
    }
  };

  return (
    <Box>
      <Collapse in={!!generatedPropertyTypeDefinitions && !loading}>
        <FormControl component="fieldset" variant="standard">
          <FormLabel component="legend" sx={{ marginBottom: 1 }}>
            Select initial property types
          </FormLabel>
          <FormGroup>
            {generatedPropertyTypeDefinitions?.map(
              ({ definition: { title, description }, selected }) => (
                <FormControlLabel
                  key={title}
                  control={
                    <Checkbox
                      checked={selected}
                      onChange={handlePropertyTypeCheckboxChange}
                      name={title}
                    />
                  }
                  label={
                    <>
                      <strong>{title}</strong> -{" "}
                      {description?.[0]?.toLowerCase()}
                      {description?.slice(1)}
                    </>
                  }
                  sx={{
                    marginLeft: 0,
                    [`.${formControlLabelClasses.label}`]: {
                      marginLeft: 2,
                    },
                  }}
                />
              ),
            )}
          </FormGroup>
        </FormControl>
      </Collapse>
      <Collapse in={loading}>
        <Box display="flex" columnGap={1} alignItems="center">
          <CircularProgress
            size={20}
            sx={{ color: ({ palette }) => palette.gray[40] }}
          />
          <Typography>
            {`${
              generatedPropertyTypeDefinitions ? "Re-generating" : "Generating"
            } property type suggestions...`}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
};
