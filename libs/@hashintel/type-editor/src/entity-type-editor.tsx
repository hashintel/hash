/* eslint-disable import/first */
require("setimmediate");

import { EntityType, PropertyType } from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { theme } from "@hashintel/design-system";
import { Box, Stack, ThemeProvider, Typography } from "@mui/material";

import { LinkListCard } from "./entity-type-editor/link-list-card";
import { PropertyListCard } from "./entity-type-editor/property-list-card";
import { EntityTypesOptionsContextProvider } from "./shared/entity-types-options-context";
import {
  EditorOntologyFunctions,
  OntologyFunctionsContext,
} from "./shared/ontology-functions-context";
import { PropertyTypesOptionsContextProvider } from "./shared/property-types-options-context";

export {
  FormProvider as EntityTypeFormProvider,
  useForm as useEntityTypeForm,
  useFormState as useEntityTypeFormState,
} from "react-hook-form";

export type EntityTypeEditorProps = {
  // the entity type being edited
  entityType: EntityType;
  // The entity types available for constraining the destination of a link, INCLUDING those used on this entity
  entityTypeOptions: Record<VersionedUri, EntityType>;
  // The property types available for assigning to an entity type or property type object, INCLUDING those used on this entity
  propertyTypeOptions: Record<VersionedUri, PropertyType>;
  // functions for creating and updating entity and property types that the editor will call
  ontologyFunctions: EditorOntologyFunctions;
};

export const EntityTypeEditor = ({
  entityType,
  entityTypeOptions,
  propertyTypeOptions,
  ontologyFunctions,
}: EntityTypeEditorProps) => {
  return (
    <ThemeProvider theme={theme}>
      <OntologyFunctionsContext.Provider value={ontologyFunctions}>
        <EntityTypesOptionsContextProvider
          entityTypeOptions={entityTypeOptions}
        >
          <PropertyTypesOptionsContextProvider
            propertyTypeOptions={propertyTypeOptions}
          >
            <Stack spacing={6.5}>
              <Box>
                <Typography variant="h5" mb={2}>
                  Properties of{" "}
                  <Box component="span" sx={{ fontWeight: "bold" }}>
                    {entityType.title}
                  </Box>
                </Typography>
                <PropertyListCard />
              </Box>

              <Box>
                <Typography variant="h5" mb={2}>
                  Links defined on{" "}
                  <Box component="span" sx={{ fontWeight: "bold" }}>
                    {entityType.title}
                  </Box>
                </Typography>
                <LinkListCard />
              </Box>
            </Stack>
          </PropertyTypesOptionsContextProvider>
        </EntityTypesOptionsContextProvider>
      </OntologyFunctionsContext.Provider>
    </ThemeProvider>
  );
};
