import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useEffect, useMemo } from "react";

import { FilterLightIcon } from "../../../../../shared/icons/filter-light-icon";
import { GrayToBlueIconButton } from "../../../gray-to-blue-icon-button";
import { ControlPanel, ItemLabel } from "./control-components";
import {
  filterButtonSx,
  NodeTypeFilters,
} from "./filter-control/node-type-filters";
import { useGraphContext } from "./graph-context";
import type { GraphVizNode } from "./types";

type NodeTypesInData = {
  [nodeTypeId: string]: {
    color: string;
    count: number;
    nodeTypeLabel: string;
    nodeTypeId: string;
  };
};

export type GraphVizFilters = {
  includeByNodeTypeId?: {
    /**
     * Whether to show nodes of a given `nodeTypeId`.
     */
    [nodeTypeId: string]: boolean;
  };
  colorByNodeTypeId?: {
    /**
     * The color to use for nodes of a given `nodeTypeId`.
     */
    [nodeTypeId: string]: string;
  };
};

const FilterPanel: FunctionComponent<{
  defaultFilters?: GraphVizFilters;
  isFiltered: boolean;
  nodeTypesInData: NodeTypesInData;
  open: boolean;
  onClose: () => void;
}> = ({ defaultFilters, isFiltered, nodeTypesInData, open, onClose }) => {
  const { filters, setFilters } = useGraphContext();

  return (
    <ControlPanel
      onClose={onClose}
      open={open}
      position="right"
      title="Filters"
    >
      <Box sx={{ pl: 1, pr: 2, pb: 0.5 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ pl: 1, mt: 0.8, mb: 0.4, height: 26 }}
        >
          <ItemLabel tooltip="Choose which types of nodes to show in the graph, and their color">
            Nodes
          </ItemLabel>
          {isFiltered && (
            <Box
              component="button"
              onClick={() => {
                setFilters({
                  ...filters,
                  includeByNodeTypeId: {
                    /**
                     * We may have saved filters for types that aren't in this graph,
                     * and we want to preserve whatever visibility setting they had.
                     */
                    ...filters.includeByNodeTypeId,
                    /**
                     * Reset all types in the current graph to the default if provided
                     */
                    ...(defaultFilters
                      ? defaultFilters.includeByNodeTypeId /**
                         * Otherwise all types in the current graph to visible.
                         */
                      : Object.values(nodeTypesInData).reduce<
                          Record<string, boolean>
                        >((acc, type) => {
                          acc[type.nodeTypeId] = true;
                          return acc;
                        }, {})),
                  },
                });
              }}
              sx={[filterButtonSx, { visibility: "visible" }]}
            >
              <Typography component="span">Reset</Typography>
            </Box>
          )}
        </Stack>
        <NodeTypeFilters typesInData={Object.values(nodeTypesInData)} />
      </Box>
    </ControlPanel>
  );
};

export const FilterControl = ({
  defaultFilters,
  nodes,
}: {
  defaultFilters?: GraphVizFilters;
  nodes: GraphVizNode[];
}) => {
  const { filters, filterPanelOpen, setFilters, setFilterPanelOpen } =
    useGraphContext();

  const nodeTypesInData = useMemo<NodeTypesInData>(() => {
    const metadataByType: NodeTypesInData = {};

    for (const node of nodes) {
      if (!node.nodeTypeId) {
        /**
         * If a node doesn't have a type we can't offer any filtering options for it.
         */
        continue;
      }

      const { nodeTypeId, nodeTypeLabel, color } = node;

      metadataByType[nodeTypeId] ??= {
        color,
        count: 0,
        nodeTypeId,
        nodeTypeLabel: nodeTypeLabel ?? nodeTypeId,
      };
      metadataByType[nodeTypeId].count++;
    }

    return metadataByType;
  }, [nodes]);

  useEffect(() => {
    const typeIdsInData = new Set(Object.keys(nodeTypesInData));

    /**
     * See which of the nodeTypeIds in the data are already represented in the data.
     * We assume that if it appears in colorsByNodeTypeId, it will also be in includeByNodeTypeId,
     * because we set both below when we first see them.
     */
    const typeIdsInFilters = new Set(
      Object.keys(filters.colorByNodeTypeId ?? {}),
    );

    const missingTypeIds = typeIdsInData.difference(typeIdsInFilters);

    if (missingTypeIds.size) {
      const newFilters = { ...filters };

      for (const missingTypeId of missingTypeIds) {
        const metadata = nodeTypesInData[missingTypeId]!;

        newFilters.colorByNodeTypeId ??= {};
        newFilters.colorByNodeTypeId[missingTypeId] = metadata.color;

        newFilters.includeByNodeTypeId ??= {};
        newFilters.includeByNodeTypeId[missingTypeId] = true;
      }
      setFilters(newFilters);
    }
  }, [filters, nodeTypesInData, nodes, setFilters]);

  const isFiltered = useMemo(() => {
    const typeIdsInData = Object.keys(nodeTypesInData);

    return typeIdsInData.some(
      /**
       * Check against an explicit 'false', because if it's absent we haven't initialized it yet.
       */
      (typeId) => filters.includeByNodeTypeId?.[typeId] === false,
    );
  }, [filters.includeByNodeTypeId, nodeTypesInData]);

  if (!Object.keys(nodeTypesInData).length) {
    return null;
  }

  return (
    <>
      <FilterPanel
        defaultFilters={defaultFilters}
        isFiltered={isFiltered}
        nodeTypesInData={nodeTypesInData}
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
      />
      <GrayToBlueIconButton
        onClick={() => setFilterPanelOpen(true)}
        sx={{ position: "absolute", top: 8, right: 46 }}
      >
        <FilterLightIcon
          sx={{
            fill: ({ palette }) =>
              isFiltered ? palette.blue[70] : palette.gray[50],
            transition: ({ transitions }) => transitions.create("fill"),
          }}
        />
      </GrayToBlueIconButton>
    </>
  );
};
