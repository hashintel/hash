import {
  LoadingSpinner,
  OntologyChip,
  OntologyIcon,
  parseUrlForOntologyChip,
} from "@hashintel/design-system";
import {
  EntityTypeEditor,
  EntityTypeEditorFormData,
  EntityTypeFormProvider,
  getFormDataFromSchema,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { BaseUrl } from "@local/hash-subgraph";
import { Backdrop, Box, Slide, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { Link } from "../../../../../shared/ui";
import { useRouteNamespace } from "../../../shared/use-route-namespace";
import { getTypesWithoutMetadata } from "./definition-tab";
import { EntityTypeContext } from "./shared/entity-type-context";
import { EntityTypeHeader } from "./shared/entity-type-header";
import { useEntityTypeValue } from "./use-entity-type-value";

const SLIDE_WIDTH = 1000;

interface TypePreviewSlideProps {
  typeUrl: BaseUrl;
  onClose: () => void;
}

export const TypePreviewSlide: FunctionComponent<TypePreviewSlideProps> = ({
  typeUrl,
  onClose,
}) => {
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { properties: [], links: [] },
  });
  const { reset } = formMethods;

  const [
    remoteEntityType,
    remotePropertyTypes,
    _updateEntityType,
    _publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    typeUrl,
    routeNamespace?.accountId ?? null,
    (fetchedEntityType) => {
      reset(getFormDataFromSchema(fetchedEntityType));
    },
  );

  const open = !!typeUrl;

  const [animateOut, setAnimateOut] = useState(false);

  const entityTypesContext = useEntityTypesContextRequired();

  const ontology = parseUrlForOntologyChip(remoteEntityType?.$id ?? "");

  const entityTypeOptions = useMemo(
    () =>
      Object.fromEntries(
        (entityTypesContext.entityTypes ?? []).map((entityType) => [
          entityType.schema.$id,
          entityType.schema,
        ]),
      ),
    [entityTypesContext.entityTypes],
  );

  if (!remotePropertyTypes) {
    return null;
  }

  const propertyTypeOptions = getTypesWithoutMetadata(remotePropertyTypes);

  return (
    <Backdrop
      open={open}
      onClick={() => {
        setAnimateOut(true);

        setTimeout(() => {
          onClose();
          setAnimateOut(false);
        }, 300);
      }}
      sx={{ zIndex: ({ zIndex }) => zIndex.drawer + 2 }}
    >
      <Slide
        in={open && !animateOut}
        direction="left"
        onClick={(event) => event.stopPropagation()}
      >
        <Box
          sx={{
            height: 1,
            width: SLIDE_WIDTH,
            background: "white",
            position: "absolute",
            top: 0,
            right: 0,
          }}
        >
          {loadingNamespace || loadingRemoteEntityType || !remoteEntityType ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 1,
                height: 1,
                color: ({ palette }) => palette.primary.main,
              }}
            >
              <LoadingSpinner size={24} />
            </Box>
          ) : (
            <Box padding={8}>
              <EntityTypeFormProvider {...formMethods}>
                <EntityTypeContext.Provider value={remoteEntityType}>
                  <EntityTypeHeader
                    ontologyChip={
                      <Link
                        href={remoteEntityType.$id}
                        target="_blank"
                        style={{ textDecoration: "none" }}
                      >
                        <OntologyChip
                          icon={<OntologyIcon />}
                          domain={ontology.domain}
                          path={
                            <Typography
                              component="span"
                              fontWeight="bold"
                              color={(theme) => theme.palette.blue[70]}
                            >
                              {ontology.path}
                            </Typography>
                          }
                        />
                      </Link>
                    }
                    entityType={remoteEntityType}
                    isReadonly
                  />
                  <EntityTypeEditor
                    entityType={remoteEntityType}
                    entityTypeOptions={entityTypeOptions}
                    propertyTypeOptions={propertyTypeOptions}
                    readonly
                  />
                </EntityTypeContext.Provider>
              </EntityTypeFormProvider>
            </Box>
          )}
        </Box>
      </Slide>
    </Backdrop>
  );
};
