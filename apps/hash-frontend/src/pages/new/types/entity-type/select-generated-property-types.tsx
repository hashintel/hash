import { PropertyType } from "@blockprotocol/type-system";
import { Chip, TriangleExclamationIcon } from "@hashintel/design-system";
import {
  BaseUrl,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph/.";
import { getPropertyTypesByBaseUrl } from "@local/hash-subgraph/stdlib";
import { ChevronRight } from "@mui/icons-material";
import {
  Box,
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
import { debounce } from "lodash";
import {
  ChangeEvent,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWatch } from "react-hook-form";

import { useBlockProtocolQueryPropertyTypes } from "../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
import { useAgentRunner } from "../../../../components/hooks/use-agent-runner";
import { LayerPlusIcon } from "../../../../shared/icons/layer-plus-icon";
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

  const [generatePropertyTypesUsingAgentRunner, { loading }] = useAgentRunner(
    "generate-entity-type-property-types",
    { errorPolicy: "ignore" },
  );

  const [
    generatedPropertyTypeDefinitions,
    setGeneratedPropertyTypeDefinitions,
  ] =
    useState<
      { definition: PropertyTypeDefinition | PropertyType; selected: boolean }[]
    >();
  const [generationError, setGenerationError] = useState<boolean>(false);

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

  const latestCallIdRef = useRef<number>(0);

  const generatePropertyTypes = useCallback(
    async (params: {
      entityTypeTitle: string;
      entityTypeDescription: string;
    }) => {
      const callId = new Date().getTime();

      latestCallIdRef.current = callId;

      setGenerationError(false);

      const { output, errors } = await generatePropertyTypesUsingAgentRunner(
        params,
      );

      if (callId !== latestCallIdRef.current) {
        return;
      }

      if (!output || (errors && errors.length > 0)) {
        setGenerationError(true);
      } else {
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
    [
      generateTypeUrlsForUser,
      generatePropertyTypesUsingAgentRunner,
      getLatestPropertyType,
    ],
  );

  const debouncedGeneratePropertyTypes = useMemo(
    () => debounce(generatePropertyTypes, 1000),
    [generatePropertyTypes],
  );

  useEffect(() => {
    if (entityTypeTitle && entityTypeDescription) {
      setGenerationError(false);
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
              ({ definition, selected }) => {
                const { title, description } = definition;

                return (
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
                        {"$id" in definition ? (
                          <Box
                            component="i"
                            sx={{
                              marginLeft: 1,
                              color: ({ palette }) => palette.gray[50],
                            }}
                          >
                            @{definition.$id.split("@")![1]}
                          </Box>
                        ) : (
                          <Chip
                            icon={<LayerPlusIcon />}
                            label="New"
                            color="gray"
                            sx={{
                              marginLeft: 1,
                              backgroundColor: "transparent",
                              borderColor: ({ palette }) => palette.gray[20],
                            }}
                          />
                        )}
                      </>
                    }
                    sx={{
                      marginLeft: 0,
                      marginBottom: 0.5,
                      [`.${formControlLabelClasses.label}`]: {
                        marginLeft: 2,
                      },
                    }}
                  />
                );
              },
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
          <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
            {`${
              generatedPropertyTypeDefinitions ? "Re-generating" : "Generating"
            } property type suggestions...`}
          </Typography>
        </Box>
      </Collapse>
      <Collapse in={generationError}>
        <Box display="flex" alignItems="center" columnGap={1}>
          <TriangleExclamationIcon
            sx={{
              fontSize: 18,
              fill: ({ palette }) => palette.red[70],
              marginBottom: -0.2,
            }}
          />
          <Typography sx={{ color: ({ palette }) => palette.gray[70] }}>
            Error suggesting property types.{" "}
            <Box
              component="span"
              role="button"
              tabIndex={0}
              onClick={() =>
                generatePropertyTypes({
                  entityTypeTitle,
                  entityTypeDescription,
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  void generatePropertyTypes({
                    entityTypeTitle,
                    entityTypeDescription,
                  });
                }
              }}
              sx={{
                display: "inline-flex",
                alignItems: "flex-end",
                cursor: "pointer",
                color: ({ palette }) => palette.gray[80],
                svg: {
                  marginLeft: -0.5,
                  marginBottom: -0.2,
                  position: "relative",
                  transition: ({ transitions }) => transitions.create("left"),
                  left: 0,
                },
                ":hover": {
                  color: ({ palette }) => palette.common.black,
                  svg: {
                    left: 8,
                  },
                },
              }}
            >
              Click to retry
              <ChevronRight />
            </Box>
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
};
