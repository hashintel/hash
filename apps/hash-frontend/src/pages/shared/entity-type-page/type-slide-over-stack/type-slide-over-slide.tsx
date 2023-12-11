import { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  ArrowLeftIcon,
  CloseIcon,
  LoadingSpinner,
  OntologyChip,
  parseUrlForOntologyChip,
} from "@hashintel/design-system";
import {
  EntityTypeEditor,
  EntityTypeEditorFormData,
  EntityTypeFormProvider,
  getFormDataFromSchema,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Slide } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { Button, Link } from "../../../../shared/ui";
import { useRouteNamespace } from "../../../[shortname]/shared/use-route-namespace";
import { EntityTypeContext } from "../shared/entity-type-context";
import { EntityTypeHeader } from "../shared/entity-type-header";
import { getTypesWithoutMetadata } from "../shared/get-types-without-metadata";
import { useEntityTypeValue } from "../use-entity-type-value";

const SLIDE_WIDTH = 1000;

interface TypeSlideOverSlideProps {
  stackPosition: number;
  open: boolean;
  onBack?: () => void;
  onClose: () => void;
  onNavigateToType: (url: VersionedUrl) => void;
  typeUrl: VersionedUrl;
}

export const TypeSlideOverSlide: FunctionComponent<TypeSlideOverSlideProps> = ({
  stackPosition,
  onNavigateToType,
  typeUrl,
  open,
  onBack,
  onClose,
}) => {
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { allOf: [], properties: [], links: [] },
  });
  const { reset } = formMethods;

  const { baseUrl, version } = componentsFromVersionedUrl(typeUrl);

  const [
    remoteEntityType,
    _maxVersion,
    remotePropertyTypes,
    _updateEntityType,
    _publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    baseUrl,
    version,
    routeNamespace?.accountId ?? null,
    (fetchedEntityType) => {
      reset(getFormDataFromSchema(fetchedEntityType.schema));
    },
  );

  const [animateOut, setAnimateOut] = useState(false);

  const entityTypesContext = useEntityTypesContextRequired();

  const ontology = remoteEntityType
    ? parseUrlForOntologyChip(remoteEntityType.schema.$id)
    : undefined;

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

  const handleBackClick = useCallback(() => {
    setAnimateOut(true);
    setTimeout(() => {
      setAnimateOut(false);
      onBack?.();
    }, 300);
  }, [setAnimateOut, onBack]);

  if (!remotePropertyTypes) {
    return null;
  }

  const propertyTypeOptions = getTypesWithoutMetadata(remotePropertyTypes);

  return (
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
          overflowY: "auto",
          zIndex: stackPosition * 10000,
        }}
      >
        <Box
          paddingX={4}
          paddingY={2}
          display="flex"
          justifyContent="space-between"
          flexDirection="row-reverse"
        >
          <Button
            size="xs"
            variant="tertiary_quiet"
            onClick={onClose}
            endIcon={<CloseIcon />}
          >
            Close
          </Button>
          {onBack ? (
            <Button
              size="xs"
              variant="tertiary_quiet"
              onClick={handleBackClick}
              startIcon={<ArrowLeftIcon />}
            >
              Back
            </Button>
          ) : null}
        </Box>
        {loadingNamespace ||
        loadingRemoteEntityType ||
        !remoteEntityType ||
        !ontology ? (
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
          <Box padding={8} paddingTop={2}>
            <EntityTypeFormProvider {...formMethods}>
              <EntityTypeContext.Provider value={remoteEntityType.schema}>
                <EntityTypeHeader
                  isDraft={false}
                  isPreviewSlide
                  isLink={
                    !!entityTypesContext.isSpecialEntityTypeLookup?.[
                      remoteEntityType.schema.$id
                    ]?.isFile
                  }
                  ontologyChip={
                    <Link
                      href={remoteEntityType.schema.$id}
                      target="_blank"
                      style={{ textDecoration: "none" }}
                    >
                      <OntologyChip {...ontology} />
                    </Link>
                  }
                  entityType={remoteEntityType.schema}
                  isReadonly
                />
                <EntityTypeEditor
                  customization={{ onNavigateToType }}
                  entityType={remoteEntityType.schema}
                  entityTypeOptions={entityTypeOptions}
                  ontologyFunctions={null}
                  propertyTypeOptions={propertyTypeOptions}
                  readonly
                />
              </EntityTypeContext.Provider>
            </EntityTypeFormProvider>
          </Box>
        )}
      </Box>
    </Slide>
  );
};
