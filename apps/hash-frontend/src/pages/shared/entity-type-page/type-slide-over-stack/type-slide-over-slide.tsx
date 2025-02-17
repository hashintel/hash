import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  ArrowUpRightFromSquareRegularIcon,
  IconButton,
  LoadingSpinner,
  OntologyChip,
  parseUrlForOntologyChip,
} from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeEditor,
  EntityTypeFormProvider,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, ButtonBase, Slide, Tooltip } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { useCallback, useMemo, useState } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { Link } from "../../../../shared/ui";
import { useRouteNamespace } from "../../../@/[shortname]/shared/use-route-namespace";
import { useDataTypesContext } from "../../data-types-context";
import { SlideBackForwardCloseBar } from "../../shared/slide-back-forward-close-bar";
import { EntityTypeContext } from "../shared/entity-type-context";
import { EntityTypeHeader } from "../shared/entity-type-header";
import { useEntityTypeValue } from "../use-entity-type-value";

const CopyableOntologyChip: FunctionComponent<{
  entityType: EntityTypeWithMetadata;
}> = ({ entityType }) => {
  const [tooltipTitle, setTooltipTitle] = useState("Copy type URL");

  const [copyTooltipIsOpen, setCopyTooltipIsOpen] = useState(false);

  const ontology = parseUrlForOntologyChip(entityType.schema.$id);

  const handleCopyEntityTypeUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(entityType.schema.$id);
      setTooltipTitle("Copied type URL!");
    } catch {
      setTooltipTitle("Not allowed to copy to clipboard");
    } finally {
      setTimeout(() => {
        setCopyTooltipIsOpen(false);

        setTimeout(() => {
          setTooltipTitle("Copy type URL");
        }, 300);
      }, 500);
    }
  }, [entityType]);

  return (
    <Box display="flex" alignItems="center" columnGap={1}>
      <Tooltip
        open={copyTooltipIsOpen}
        title={tooltipTitle}
        placement="top"
        slotProps={{
          tooltip: {
            sx: {
              maxWidth: "unset",
              textWrap: "no-wrap",
            },
          },
        }}
      >
        <ButtonBase
          onClick={handleCopyEntityTypeUrl}
          onMouseEnter={() => setCopyTooltipIsOpen(true)}
          onMouseLeave={() => setCopyTooltipIsOpen(false)}
        >
          <OntologyChip {...ontology} />
        </ButtonBase>
      </Tooltip>
      <Link href={entityType.schema.$id} target="_blank">
        <IconButton
          sx={{
            padding: 0,
            transition: ({ transitions }) => transitions.create("color"),
            "&:hover": {
              background: "transparent",
              color: ({ palette }) => palette.blue[70],
            },
            svg: {
              fontSize: 14,
            },
          }}
        >
          <ArrowUpRightFromSquareRegularIcon />
        </IconButton>
      </Link>
    </Box>
  );
};

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
                  isDraft={false}
                  isPreviewSlide
                  isLink={
                    !!entityTypesContext.isSpecialEntityTypeLookup?.[
                      remoteEntityType.schema.$id
                    ]?.isLink
                  }
                  ontologyChip={
                    <CopyableOntologyChip entityType={remoteEntityType} />
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
