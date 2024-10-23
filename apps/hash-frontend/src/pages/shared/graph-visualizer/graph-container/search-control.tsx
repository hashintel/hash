import { IconButton } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchIcon } from "../../../../shared/icons/search-icon";
import { controlButtonSx, ControlPanel } from "./shared/control-components";
import { useGraphContext } from "./shared/graph-context";
import { SimpleAutocomplete } from "./shared/simple-autocomplete";
import type { GraphVizNode } from "./shared/types";

type NodeData = GraphVizNode & {
  valueForSelector: string;
};

const Search = ({
  nodes,
  open,
  onClose,
}: {
  nodes: GraphVizNode[];
  open: boolean;
  onClose: () => void;
}) => {
  const { filters, refreshGraphHighlights, setGraphState } = useGraphContext();

  const [selectedNode, _setSelectedNode] = useState<NodeData | null>(null);

  const sigma = useSigma();

  const nodeOptions = useMemo(() => {
    const { includeByNodeTypeId } = filters;

    const options: NodeData[] = [];

    for (const node of nodes) {
      const { nodeId } = node;

      if (!node.nodeTypeId || !includeByNodeTypeId?.[node.nodeTypeId]) {
        continue;
      }

      options.push({
        ...node,
        valueForSelector: nodeId,
      });
    }

    return options;
  }, [filters, nodes]);

  const setSelectedNode = (node: NodeData | null) => {
    _setSelectedNode(node);
    if (node) {
      setGraphState("selectedNodeId", node.nodeId);
      refreshGraphHighlights();

      const coords = sigma.getNodeDisplayData(node.nodeId);
      if (coords) {
        void sigma.getCamera().animate(
          {
            x: coords.x,
            y: coords.y,
            ratio: 1,
          },
          { duration: 500 },
        );
      }
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <ControlPanel onClose={onClose} open={open} position="left" title="Search">
      <Box sx={{ width: 460, px: 1.5, mt: 1 }}>
        <SimpleAutocomplete
          autoFocus
          endAdornment={
            <SearchIcon
              sx={{ fontSize: 16, color: ({ palette }) => palette.gray[30] }}
            />
          }
          inputRef={inputRef}
          options={nodeOptions}
          placeholder="Search for node..."
          setValue={setSelectedNode}
          value={selectedNode}
        />
      </Box>
    </ControlPanel>
  );
};

export const SearchControl = ({ nodes }: { nodes: GraphVizNode[] }) => {
  const { searchPanelOpen, setSearchPanelOpen } = useGraphContext();

  return (
    <>
      <Search
        nodes={nodes}
        open={searchPanelOpen}
        onClose={() => setSearchPanelOpen(false)}
      />
      <IconButton
        onClick={() => setSearchPanelOpen(true)}
        sx={[controlButtonSx, { position: "absolute", top: 8, left: 46 }]}
      >
        <SearchIcon />
      </IconButton>
    </>
  );
};
