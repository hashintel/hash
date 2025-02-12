import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { LoadingSpinner } from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeEditor,
  EntityTypeFormProvider,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Slide } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { useCallback, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useRouteNamespace } from "../../../@/[shortname]/shared/use-route-namespace";
import { useDataTypesContext } from "../../data-types-context";
import { SlideBackForwardCloseBar } from "../../shared/slide-back-forward-close-bar";
import { EntityTypeContext } from "../shared/entity-type-context";
import { EntityTypeHeader } from "../shared/entity-type-header";
import { useEntityTypeValue } from "../use-entity-type-value";

const SLIDE_WIDTH = 1000;

interface TypeSlideOverSlideProps {
  stackPosition: number;
  open: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onClose: () => void;
  onNavigateToType: (url: VersionedUrl) => void;
  /**
   * If a container ref is provided, the slide will be attached to it (defaults to the MUI default, the body)
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
  typeUrl: VersionedUrl;
}

export const TypeSlideOverSlide: FunctionComponent<TypeSlideOverSlideProps> = ({
  stackPosition,
  onNavigateToType,
  typeUrl,
  open,
  onBack,
  onClose,
  onForward,
  slideContainerRef,
}) => {
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { allOf: [], properties: [], links: [], inverse: {} },
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
      reset(getFormDataFromEntityType(fetchedEntityType.schema));
    },
  );

  const [animateOut, setAnimateOut] = useState(false);

  const entityTypesContext = useEntityTypesContextRequired();

  const entityTypeOptions = useMemo(
    () =>
      Object.fromEntries(
        (entityTypesContext.entityTypes ?? []).map((entityType) => [
          entityType.schema.$id,
          entityType,
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

  const { dataTypes } = useDataTypesContext();
  const dataTypeOptions = useMemo(() => {
    if (!dataTypes) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(dataTypes).map(([key, value]) => [key, value.schema]),
    );
  }, [dataTypes]);

  if (!remotePropertyTypes || !dataTypeOptions) {
    return null;
  }

  return (
    <Slide
      container={slideContainerRef?.current ?? undefined}
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
          zIndex: ({ zIndex }) => zIndex.drawer + 2 + stackPosition,
        }}
      >
        <SlideBackForwardCloseBar
          onBack={onBack ? handleBackClick : undefined}
          onForward={onForward}
          onClose={onClose}
        />
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
          <Box padding={8} paddingTop={2}>
            <EntityTypeFormProvider {...formMethods}>
              <EntityTypeContext.Provider value={remoteEntityType.schema}>
                <EntityTypeHeader
                  currentVersion={version}
                  isDraft={false}
                  isPreviewSlide
                  isLink={
                    !!entityTypesContext.isSpecialEntityTypeLookup?.[
                      remoteEntityType.schema.$id
                    ]?.isLink
                  }
                  entityTypeSchema={remoteEntityType.schema}
                  isReadonly
                />
                <EntityTypeEditor
                  customization={{ onNavigateToType }}
                  dataTypeOptions={dataTypeOptions}
                  entityType={remoteEntityType}
                  entityTypeOptions={entityTypeOptions}
                  ontologyFunctions={null}
                  propertyTypeOptions={remotePropertyTypes}
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
