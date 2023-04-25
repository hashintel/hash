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
  const entityTypeTitle = useWatch({ name: "name" });
  const entityTypeDescription = useWatch({ name: "description" });

  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();
  const generateTypeUrlsForUser = useGenerateTypeUrlsForUser();

  const [generatePropertyTypes, { loading }] = useAgentRunner(
    "generate-entity-type-property-types",
  );

  const [
    generatedPropertyTypeDefinitions,
    setGeneratedPropertyTypeDefinitions,
  ] = useState<(PropertyTypeDefinition | PropertyType)[]>();
  const [selectedPropertyTypeTitles, setSelectedPropertyTypeTitles] = useState<
    string[]
  >([]);

  const [allPropertyTypes, setAllPropertyTypes] = useState<Subgraph>();

  const fetchAllPropertyTypes = useCallback(async () => {
    const { data: propertyTypesSubgraph } = await queryPropertyTypes({
      data: {},
    });

    if (!propertyTypesSubgraph) {
      throw new Error(
        "Could not query property types to get all property types.",
      );
    }

    setAllPropertyTypes(propertyTypesSubgraph);
  }, [queryPropertyTypes]);

  useEffect(() => {
    if (!allPropertyTypes) {
      void fetchAllPropertyTypes();
    }
  }, [allPropertyTypes, fetchAllPropertyTypes]);

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

            setGeneratedPropertyTypeDefinitions(propertyTypeDefinitions);
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
    setSelectedPropertyTypeTitles((prev) => {
      const updatedSelectedPropertyTypeTitles = target.checked
        ? [...prev, target.name]
        : prev.filter((title) => title !== target.name);

      if (generatedPropertyTypeDefinitions) {
        onSelectedPropertiesChange(
          generatedPropertyTypeDefinitions.filter(({ title }) =>
            updatedSelectedPropertyTypeTitles.includes(title),
          ),
        );
      }

      return updatedSelectedPropertyTypeTitles;
    });
  };

  return (
    <Box>
      <Collapse in={!!generatedPropertyTypeDefinitions && !loading}>
        <FormControl component="fieldset" variant="standard">
          <FormLabel component="legend" sx={{ marginBottom: 1 }}>
            Select initial property types
          </FormLabel>
          <FormGroup>
            {generatedPropertyTypeDefinitions?.map(({ title, description }) => (
              <FormControlLabel
                key={title}
                control={
                  <Checkbox
                    checked={selectedPropertyTypeTitles.includes(title)}
                    onChange={handlePropertyTypeCheckboxChange}
                    name={title}
                  />
                }
                label={
                  <>
                    <strong>{title}</strong> - {description?.[0]?.toLowerCase()}
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
            ))}
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
