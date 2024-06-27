/* eslint-disable import/first */
require("setimmediate");

import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/graph";
import type { DataType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { fluidFontClassName, theme } from "@hashintel/design-system/theme";
import { Box, Stack, ThemeProvider, Typography } from "@mui/material";

import { InheritanceRow } from "./entity-type-editor/inheritance-row";
import { LinkListCard } from "./entity-type-editor/link-list-card";
import { PropertyListCard } from "./entity-type-editor/property-list-card";
import { CustomizationContext } from "./shared/customization-context";
import { DataTypesOptionsContextProvider } from "./shared/data-types-options-context";
import { EntityTypesOptionsContextProvider } from "./shared/entity-types-options-context";
import type { EditorOntologyFunctions } from "./shared/ontology-functions-context";
import { OntologyFunctionsContext } from "./shared/ontology-functions-context";
import { PropertyTypesOptionsContextProvider } from "./shared/property-types-options-context";
import { ReadonlyContext } from "./shared/read-only-context";

export {
  Controller as EntityTypeFormController,
  FormProvider as EntityTypeFormProvider,
  useForm as useEntityTypeForm,
  useFormContext as useEntityTypeFormContext,
  useController as useEntityTypeFormController,
  useFormState as useEntityTypeFormState,
  useWatch as useEntityTypeFormWatch,
} from "react-hook-form";

export type CustomizationOptions = {
  /**
   *  A callback to provide custom handling a user clicking a link to another type.
   *  If defined, default anchor behavior will be prevented on click.
   */
  onNavigateToType?: (url: VersionedUrl) => void;
};

export type EntityTypeEditorProps = {
  customization?: CustomizationOptions;
  // The data types available for assigning to a property type, INCLUDING those used on this entity
  dataTypeOptions: Record<VersionedUrl, DataType>;
  // the entity type being edited
  entityType: EntityTypeWithMetadata;
  // The entity types available for (a) extending or (b) constraining the destination of a link, INCLUDING those used on this entity
  entityTypeOptions: Record<VersionedUrl, EntityTypeWithMetadata>;
  // The property types available for assigning to an entity type or property type object, INCLUDING those used on this entity
  propertyTypeOptions: Record<VersionedUrl, PropertyTypeWithMetadata>;
  // functions for creating and updating types. Pass 'null' if not available (editor will be forced into readonly)
  ontologyFunctions: EditorOntologyFunctions | null;
  // whether or not the type editor should be in readonly mode
  readonly: boolean;
};

export const EntityTypeEditor = ({
  customization = {},
  dataTypeOptions,
  entityType,
  entityTypeOptions,
  propertyTypeOptions,
  ontologyFunctions,
  readonly,
}: EntityTypeEditorProps) => {
  return (
    <ThemeProvider theme={theme}>
      <ReadonlyContext.Provider value={readonly || !ontologyFunctions}>
        <CustomizationContext.Provider value={customization}>
          <OntologyFunctionsContext.Provider value={ontologyFunctions}>
            <EntityTypesOptionsContextProvider
              entityTypeOptions={entityTypeOptions}
            >
              <PropertyTypesOptionsContextProvider
                propertyTypeOptions={propertyTypeOptions}
              >
                <DataTypesOptionsContextProvider
                  dataTypeOptions={dataTypeOptions}
                >
                  <Stack spacing={6.5} className={fluidFontClassName}>
                    <Box>
                      <Typography variant="h5" mb={2}>
                        Extends
                      </Typography>
                      <InheritanceRow
                        entityTypeId={entityType.schema.$id}
                        typeTitle={entityType.schema.title}
                      />
                    </Box>

                    <Box>
                      <Typography variant="h5" mb={2}>
                        Properties of{" "}
                        <Box component="span" sx={{ fontWeight: "bold" }}>
                          {entityType.schema.title}
                        </Box>
                      </Typography>
                      <PropertyListCard />
                    </Box>

                    <Box>
                      <Typography variant="h5" mb={2}>
                        Links defined on{" "}
                        <Box component="span" sx={{ fontWeight: "bold" }}>
                          {entityType.schema.title}
                        </Box>
                      </Typography>
                      <LinkListCard />
                    </Box>
                  </Stack>
                </DataTypesOptionsContextProvider>
              </PropertyTypesOptionsContextProvider>
            </EntityTypesOptionsContextProvider>
          </OntologyFunctionsContext.Provider>
        </CustomizationContext.Provider>
      </ReadonlyContext.Provider>
    </ThemeProvider>
  );
};
