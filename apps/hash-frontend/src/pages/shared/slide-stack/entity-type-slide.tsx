import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Skeleton } from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeEditor,
  EntityTypeFormProvider,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Stack } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useRouteNamespace } from "../../@/[shortname]/shared/use-route-namespace";
import { useDataTypesContext } from "../data-types-context";
import { EntityTypeContext } from "../entity-type-page/shared/entity-type-context";
import { EntityTypeHeader } from "../entity-type-page/shared/entity-type-header";
import { useEntityTypeValue } from "../entity-type-page/use-entity-type-value";
import type { PushToStackFn } from "./types";

interface EntityTypeSlideProps {
  isReadOnly: boolean;
  pushToStack: PushToStackFn;
  typeUrl: VersionedUrl;
}

export const EntityTypeSlide: FunctionComponent<EntityTypeSlideProps> = ({
  isReadOnly,
  pushToStack,
  typeUrl,
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
    routeNamespace?.ownedById ?? null,
    (fetchedEntityType) => {
      reset(getFormDataFromEntityType(fetchedEntityType.schema));
    },
  );

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

  if (loadingNamespace || loadingRemoteEntityType || !remoteEntityType) {
    return (
      <Stack gap={4} p={5}>
        <Skeleton height={120} />
        <Skeleton height={90} />
        <Skeleton height={300} />
      </Stack>
    );
  }

  return (
    <Box>
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
              isReadonly={isReadOnly}
            />
            <EntityTypeEditor
              customization={{
                onNavigateToType: (kind, url) => {
                  pushToStack({ type: kind, itemId: url });
                },
              }}
              dataTypeOptions={dataTypeOptions}
              entityType={remoteEntityType}
              entityTypeOptions={entityTypeOptions}
              ontologyFunctions={null}
              propertyTypeOptions={remotePropertyTypes}
              readonly={isReadOnly}
            />
          </EntityTypeContext.Provider>
        </EntityTypeFormProvider>
      </Box>
    </Box>
  );
};
