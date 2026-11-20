import { useQuery } from "@apollo/client";
import { Portal, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import { Button, Drawer } from "@hashintel/ds-components";
import { deserializeQueryDataTypeSubgraphResponse } from "@local/hash-graph-sdk/data-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypeSubgraphQuery } from "../../graphql/queries/ontology/data-type.queries";
import { useUserPermissionsOnDataType } from "../../shared/use-user-permissions-on-data-type";
import { useDataTypesContext } from "../shared/data-types-context";
import { DsComponentsScope } from "../shared/ds-components-scope";
import { DataTypeForm } from "./data-type-form";
import { isLiveDataType } from "./data-type-form/live-data-types";

import type {
  QueryDataTypeSubgraphQuery,
  QueryDataTypeSubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { StackedDrawerProps } from "./data-type-form";
import type { DataTypeRootType } from "@blockprotocol/graph";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The create and stage modes come from the form (`StackedDrawerProps`) — the
 * form nests this drawer in those modes to author extending types and staged
 * group members.
 */
type DataTypeDrawerProps =
  | StackedDrawerProps
  | ({
      onClose: () => void;
      /** Distinct per stacked drawer, so each level animates in and out on its own */
      swapKey?: string;
    } & (
      | {
          mode: "edit";
          dataType: DataTypeWithMetadata;
          /** Show the type in the drawer without allowing changes */
          readonly?: boolean;
          onUpdated: (dataType: DataTypeWithMetadata) => void;
          /** Re-opens the editor on another stored version of the type */
          onSwitchVersion?: (dataType: DataTypeWithMetadata) => void;
        }
      /**
       * The type is still being fetched: shows the loading drawer. Switching to
       * another mode afterwards swaps the content inside the still-mounted drawer
       * slot, rather than remounting it with its enter animation replayed.
       */
      | {
          mode: "load";
          /** The lookup settled without finding the type — say so instead of loading forever */
          notFound?: boolean;
          /** Replaces the generic not-found copy, e.g. for a missing version */
          notFoundMessage?: string;
          /** The lookup itself failed (e.g. network) — offer a retry */
          loadFailed?: boolean;
          onRetryLoad?: () => void;
        }
    ));

export const DataTypeDrawer = ({
  onClose,
  swapKey = "data-type-editor",
  ...modeProps
}: DataTypeDrawerProps) => {
  const {
    dataTypes,
    latestDataTypes,
    error: dataTypesError,
    refetch: refetchDataTypes,
  } = useDataTypesContext();

  const notFound = modeProps.mode === "load" && !!modeProps.notFound;
  const loadFailed = modeProps.mode === "load" && !!modeProps.loadFailed;
  const onRetryLoad =
    modeProps.mode === "load" ? modeProps.onRetryLoad : undefined;

  /**
   * Bumped on every successful save. Hosts remount the drawer on the saved
   * version's $id, but a save that doesn't republish the edited type (e.g. a
   * membership-only group edit) keeps the same $id — the editor resets here
   * instead, clearing staged drafts the save just created (so closing stops
   * offering to keep them) and returning the form to a clean baseline.
   */
  const [saveGeneration, setSaveGeneration] = useState(0);

  return (
    /**
     * The drawer must escape whatever opened it: rendered inside the slide
     * stack it would inherit the slide's stacking context (clipping its
     * backdrop and risking burial under later slides). The portal mounts it
     * at the body, and the scope's z-index puts it above the slide stack
     * (slides sit at `zIndex.drawer + 2 + position`).
     */
    <Portal>
      <DsComponentsScope
        overlayStackRoot
        sx={{
          position: "relative",
          zIndex: ({ zIndex }) => zIndex.modal + 1,
          // The slot recipes carry the layer-polyfill's specificity boost,
          // hence the !important overrides.
          "& .data-type-editor-body": {
            backgroundColor: "#fbfbfb !important",
          },
          "& .data-type-editor-footer": {
            backgroundColor: "#fbfbfb !important",
            borderTop: "none !important",
          },
          "& .data-type-editor-header": {
            borderBottomColor: "var(--colors-neutral-s40) !important",
          },
        }}
      >
        {modeProps.mode !== "load" && dataTypes && latestDataTypes ? (
          <DataTypeForm
            key={saveGeneration}
            onClose={onClose}
            swapKey={swapKey}
            StackedDrawer={DataTypeDrawer}
            onSwitchVersion={
              modeProps.mode === "edit" ? modeProps.onSwitchVersion : undefined
            }
            editedDataType={
              modeProps.mode === "edit" ? modeProps.dataType : null
            }
            initialTitle={
              modeProps.mode === "create" || modeProps.mode === "stage"
                ? modeProps.initialTitle
                : undefined
            }
            initialExtendsDataTypeId={
              modeProps.mode === "create" || modeProps.mode === "stage"
                ? modeProps.initialExtendsDataTypeId
                : undefined
            }
            initialDraft={
              modeProps.mode === "stage" ? modeProps.initialDraft : undefined
            }
            restrictParentPrimitive={
              modeProps.mode === "stage"
                ? modeProps.restrictParentPrimitive
                : undefined
            }
            parentGroupTitle={
              modeProps.mode === "stage"
                ? modeProps.parentGroupTitle
                : undefined
            }
            siblingDrafts={
              modeProps.mode === "stage" ? modeProps.siblingDrafts : undefined
            }
            coMemberBaseUrls={
              modeProps.mode === "stage"
                ? modeProps.coMemberBaseUrls
                : undefined
            }
            onSaved={(saved) => {
              setSaveGeneration((generation) => generation + 1);
              if (modeProps.mode === "create") {
                modeProps.onCreated(saved);
              } else if (modeProps.mode === "edit") {
                modeProps.onUpdated(saved);
              }
              // Staging never saves, so nothing else arrives here
            }}
            stageDraft={
              modeProps.mode === "stage" ? modeProps.onStaged : undefined
            }
            unavailableTypeUrls={
              modeProps.mode === "stage"
                ? modeProps.unavailableTypeUrls
                : undefined
            }
            readonly={
              modeProps.mode === "edit" ? modeProps.readonly : undefined
            }
            dataTypes={dataTypes}
            latestDataTypes={latestDataTypes}
          />
        ) : loadFailed ? (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
          >
            <Drawer.Body className="data-type-editor-body">
              <Typography sx={{ fontSize: 14 }}>
                This data type could not be loaded — check your connection and
                try again.
              </Typography>
            </Drawer.Body>
            <Drawer.Footer
              className="data-type-editor-footer"
              secondaryActions={
                <Button variant="subtle" onClick={onClose}>
                  Close
                </Button>
              }
              actions={
                onRetryLoad ? (
                  <Button variant="solid" onClick={onRetryLoad}>
                    Retry
                  </Button>
                ) : undefined
              }
            />
          </Drawer>
        ) : notFound ? (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
          >
            <Drawer.Body className="data-type-editor-body">
              <Typography sx={{ fontSize: 14 }}>
                {modeProps.notFoundMessage ??
                  "This data type could not be loaded — it may have been archived or deleted."}
              </Typography>
            </Drawer.Body>
            <Drawer.Footer
              className="data-type-editor-footer"
              secondaryActions={
                <Button variant="subtle" onClick={onClose}>
                  Close
                </Button>
              }
            />
          </Drawer>
        ) : modeProps.mode !== "load" && !dataTypes && dataTypesError ? (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
          >
            <Drawer.Body className="data-type-editor-body">
              <Typography sx={{ fontSize: 14 }}>
                Could not load data types — the editor needs them to open.
              </Typography>
            </Drawer.Body>
            <Drawer.Footer
              className="data-type-editor-footer"
              secondaryActions={
                <Button variant="subtle" onClick={onClose}>
                  Close
                </Button>
              }
              actions={
                <Button
                  variant="solid"
                  onClick={() => {
                    void refetchDataTypes();
                  }}
                >
                  Retry
                </Button>
              }
            />
          </Drawer>
        ) : (
          <Drawer
            size="lg"
            position="right"
            variant="plain"
            swapKey={swapKey}
            onClose={onClose}
            loading
          >
            <Drawer.Body className="data-type-editor-body">{null}</Drawer.Body>
          </Drawer>
        )}
      </DsComponentsScope>
    </Portal>
  );
};

/**
 * The data-type editor drawer for anywhere that has only a type's id — it
 * resolves the latest version from the loaded types, falling back to a graph
 * query for types not held locally, and opens read-only without edit
 * permission.
 */
export const DataTypeDrawerById = ({
  dataTypeId,
  swapKey = "data-type-editor",
  onClose,
  onUpdated,
}: {
  dataTypeId: VersionedUrl;
  /** Distinct per stacked drawer, so each level animates in and out on its own */
  swapKey?: string;
  onClose: () => void;
  /** Called after a save instead of the default close-on-save */
  onUpdated?: (updated: DataTypeWithMetadata) => void;
}) => {
  const { dataTypes, latestDataTypes } = useDataTypesContext();

  const dataTypeBaseUrl = extractBaseUrl(dataTypeId);

  /**
   * A version picked from the breadcrumb dropdown. Picking the latest stores
   * a sentinel rather than clearing: null means "no pick yet", which defers
   * to an originally requested older $id — the pick must beat that.
   */
  const [versionOverride, setVersionOverride] = useState<
    VersionedUrl | "latest" | null
  >(null);

  // The context loads across all transaction time, so it also holds archived
  // types — those must fall through to the live-only query's not-found state
  // rather than opening an editor that can't save
  const contextHit = latestDataTypes?.[dataTypeBaseUrl] ?? null;
  const fromContext =
    contextHit && isLiveDataType(contextHit) ? contextHit : null;

  const requestedVersion = componentsFromVersionedUrl(dataTypeId).version;

  /**
   * The catalogue can trail the graph — a link to an edition published
   * elsewhere that it hasn't refetched yet. A requested edition it doesn't
   * hold falls through to the remote fetch rather than being declared missing.
   */
  const requestedHeldLocally =
    fromContext !== null &&
    (compareOntologyTypeVersions(
      requestedVersion,
      fromContext.metadata.recordId.version,
    ) === 0 ||
      !!dataTypes?.[dataTypeId]);

  const {
    data: remoteData,
    loading: remoteLoading,
    error: remoteError,
    refetch: refetchRemoteType,
  } = useQuery<QueryDataTypeSubgraphQuery, QueryDataTypeSubgraphQueryVariables>(
    queryDataTypeSubgraphQuery,
    {
      variables: {
        request: {
          filter: {
            equal: [{ path: ["baseUrl"] }, { parameter: dataTypeBaseUrl }],
          },
          // Live types only: an archived type must land on the not-found
          // message rather than opening an editor that can't save it
          temporalAxes: currentTimeInstantTemporalAxes,
          graphResolveDepths: {
            inheritsFrom: 255,
            constrainsValuesOn: 255,
          },
          traversalPaths: [],
        },
      },
      skip: requestedHeldLocally,
      fetchPolicy: "cache-and-network",
    },
  );

  const { fetchedLatest, fetchedRequested } = useMemo<{
    fetchedLatest: DataTypeWithMetadata | null;
    fetchedRequested: DataTypeWithMetadata | null;
  }>(() => {
    if (!remoteData) {
      return { fetchedLatest: null, fetchedRequested: null };
    }

    let latest: DataTypeWithMetadata | null = null;
    let requested: DataTypeWithMetadata | null = null;
    for (const dataType of getRoots<DataTypeRootType>(
      deserializeQueryDataTypeSubgraphResponse(remoteData.queryDataTypeSubgraph)
        .subgraph,
    )) {
      if (dataType.schema.$id === dataTypeId) {
        requested = dataType;
      }
      if (
        !latest ||
        compareOntologyTypeVersions(
          dataType.metadata.recordId.version,
          latest.metadata.recordId.version,
        ) > 0
      ) {
        latest = dataType;
      }
    }
    return { fetchedLatest: latest, fetchedRequested: requested };
  }, [remoteData, dataTypeId]);

  const latestKnown = fromContext ?? fetchedLatest;
  const latestVersion = latestKnown?.metadata.recordId.version ?? null;

  // An explicitly requested version other than the latest opens that stored
  // edition — the catalogue spans all versions, and the remote fetch returns
  // every live one — rather than silently resolving to latest
  const requestedDiffers =
    latestVersion !== null &&
    compareOntologyTypeVersions(requestedVersion, latestVersion) !== 0;
  const requestedEdition = requestedDiffers
    ? (dataTypes?.[dataTypeId] ?? fetchedRequested)
    : null;

  // A requested edition both sources have settled without is one that never
  // existed — land on not-found rather than opening the latest edition.
  // An edition the catalogue holds never runs the remote fetch, so a
  // missing one always has the fetch to wait on.
  const requestedVersionMissing =
    requestedDiffers && !requestedEdition && !remoteLoading && !!remoteData;

  const dataType =
    versionOverride === "latest"
      ? latestKnown
      : versionOverride
        ? (dataTypes?.[versionOverride] ?? null)
        : requestedDiffers
          ? requestedEdition
          : latestKnown;

  // Only the latest version is editable, whatever the user's permissions
  const viewingNonLatest =
    dataType !== null &&
    latestVersion !== null &&
    compareOntologyTypeVersions(
      dataType.metadata.recordId.version,
      latestVersion,
    ) !== 0;

  const { userPermissions } = useUserPermissionsOnDataType(
    dataType?.schema.$id,
  );

  /**
   * Permissions deliberately don't gate the editor: it opens read-only and
   * enables editing when they resolve. Waiting for them would remount the
   * drawer mid-enter, visibly restarting its slide-in. The load mode keeps
   * the drawer slot mounted for the same reason.
   */
  if (!dataType) {
    return (
      <DataTypeDrawer
        mode="load"
        notFound={
          requestedVersionMissing ||
          (!remoteLoading && !remoteError && remoteData !== undefined)
        }
        notFoundMessage={
          requestedVersionMissing
            ? `Version ${String(requestedVersion)} of this data type does not exist — the link may be stale.`
            : undefined
        }
        loadFailed={!remoteLoading && remoteError !== undefined}
        onRetryLoad={() => {
          void refetchRemoteType();
        }}
        swapKey={swapKey}
        onClose={onClose}
      />
    );
  }

  return (
    <DataTypeDrawer
      mode="edit"
      key={dataType.schema.$id}
      dataType={dataType}
      readonly={!userPermissions?.edit || viewingNonLatest}
      swapKey={swapKey}
      onClose={onClose}
      onUpdated={onUpdated ?? (() => onClose())}
      onSwitchVersion={(switched) =>
        setVersionOverride(
          latestVersion !== null &&
            compareOntologyTypeVersions(
              switched.metadata.recordId.version,
              latestVersion,
            ) === 0
            ? "latest"
            : switched.schema.$id,
        )
      }
    />
  );
};
