import { PropertyType } from "@blockprotocol/type-system";
import { getPropertyTypeById } from "@local/hash-subgraph/stdlib";
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
import { FunctionComponent, useEffect, useMemo, useState } from "react";

import { useBlockProtocolGetPropertyType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-property-type";
import { useAgentRunner } from "../../../components/hooks/use-agent-runner";
import { useGenerateTypeUrlsForUser } from "../../shared/use-generate-type-urls-for-user";

export type PropertyTypeDefinition = {
  title: string;
  description: string;
  dataType: "text" | "number" | "boolean";
};

type SelectGeneratedPropertyTypesProps = {
  entityTypeTitle: string;
  entityTypeDescription: string;
  setSelectedPropertyDefinitions: (
    propertyDefinitions: (PropertyTypeDefinition | PropertyType)[],
  ) => void;
};

export const SelectGeneratedPropertyTypes: FunctionComponent<
  SelectGeneratedPropertyTypesProps
> = ({
  entityTypeTitle,
  entityTypeDescription,
  setSelectedPropertyDefinitions,
}) => {
  const { getPropertyType } = useBlockProtocolGetPropertyType();
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

  const debouncedGeneratePropertyTypes = useMemo(
    () =>
      debounce(
        async (params: {
          entityTypeTitle: string;
          entityTypeDescription: string;
        }) => {
          const result = await generatePropertyTypes(params);

          if (result) {
            const propertyTypeDefinitions: (
              | PropertyTypeDefinition
              | PropertyType
            )[] = [];

            for (const definition of result.propertyTypeDefinitions) {
              const { versionedUrl: propertyTypeId } = generateTypeUrlsForUser({
                kind: "property-type",
                title: definition.title,
                version: 1,
              });

              const { data: propertyTypeSubgraph } = await getPropertyType({
                data: { propertyTypeId },
              });

              const propertyType = propertyTypeSubgraph
                ? getPropertyTypeById(propertyTypeSubgraph, propertyTypeId)
                : undefined;

              /** @todo: get the latest type */

              propertyTypeDefinitions.push(propertyType?.schema ?? definition);
            }

            setGeneratedPropertyTypeDefinitions(propertyTypeDefinitions);
          }
        },
        1000,
      ),
    [generateTypeUrlsForUser, generatePropertyTypes, getPropertyType],
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
  }: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPropertyTypeTitles((prev) =>
      target.checked
        ? [...prev, target.name]
        : prev.filter((title) => title !== target.name),
    );
  };

  useEffect(() => {
    if (generatedPropertyTypeDefinitions) {
      setSelectedPropertyDefinitions(
        generatedPropertyTypeDefinitions.filter(({ title }) =>
          selectedPropertyTypeTitles.includes(title),
        ),
      );
    }
  }, [
    selectedPropertyTypeTitles,
    generatedPropertyTypeDefinitions,
    setSelectedPropertyDefinitions,
  ]);

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
                    <strong>{title}</strong> {description}
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
            {generatedPropertyTypeDefinitions
              ? "Re-generating property types..."
              : "Generating property types..."}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
};
