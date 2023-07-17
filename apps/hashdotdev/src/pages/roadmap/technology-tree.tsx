import { Box, Container, Typography } from "@mui/material";
import { curveMonotoneX, line as d3Line } from "d3";
import { graphStratify, shapeEllipse, sugiyama, tweakShape } from "d3-dag";
import { FunctionComponent, useMemo, useState } from "react";

import {
  technologyTreeData,
  TechnologyTreeNodeData,
  TechnologyTreeNodeStatus,
  TechnologyTreeNodeUseCase,
} from "./technology-tree-data";
import {
  TechnologyTreeNode,
  technologyTreeNodeMinHeight,
  technologyTreeNodeWidth,
} from "./technology-tree-node";

const generateLinePath = d3Line().curve(curveMonotoneX);

export const TechnologyTree: FunctionComponent<{
  statuses?: TechnologyTreeNodeStatus[];
  useCases?: TechnologyTreeNodeUseCase[];
}> = ({ statuses, useCases }) => {
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>();

  const filteredTechnologyTreeData = useMemo(() => {
    // Lookup map of id to node data
    const idToNode = new Map<string, TechnologyTreeNodeData>(
      technologyTreeData.map((node) => [node.id, node]),
    );

    // The filtered list of nodes
    const filteredNodes = technologyTreeData.filter(
      (node) =>
        (!statuses || statuses.includes(node.status)) &&
        (!useCases ||
          node.useCases.some((useCase) => useCases.includes(useCase))),
    );

    // Lookup set of filtered node ids
    const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));

    // Function to get the unfiltered parents of a node
    const getUnfilteredParents = (nodeId: string): string[] => {
      const node = idToNode.get(nodeId)!;
      const parentNodes =
        node.parentIds?.map((parentId) => idToNode.get(parentId)!) ?? [];

      return parentNodes
        .map(({ id: parentId }) =>
          filteredNodeIds.has(parentId)
            ? parentId
            : getUnfilteredParents(parentId).flat(),
        )
        .flat();
    };

    // Update the parentIds for each filtered node to ensure it doesn't include any unfiltered nodes
    return filteredNodes.map((node) => ({
      ...node,
      parentIds: getUnfilteredParents(node.id),
    }));
  }, [statuses, useCases]);

  const blurredNodes = useMemo(() => {
    if (focusedNodeId) {
      const descendants: string[] = [];

      const checkDescendants = (nodeId: string) => {
        for (const node of filteredTechnologyTreeData) {
          if (node.parentIds.includes(nodeId)) {
            descendants.push(node.id);
            checkDescendants(node.id);
          }
        }
      };

      checkDescendants(focusedNodeId);

      const focusedNodes = [focusedNodeId, ...descendants];

      return filteredTechnologyTreeData
        .map(({ id }) => id)
        .filter((id) => !focusedNodes.includes(id));
    }
    return [];
  }, [filteredTechnologyTreeData, focusedNodeId]);

  const { nodes, links, layoutHeight, layoutWidth } = useMemo(() => {
    const builder = graphStratify();
    const graph = builder(filteredTechnologyTreeData);

    // Create function for truncating the edges so we can render arrows nicely
    const shape = tweakShape(
      [technologyTreeNodeWidth, technologyTreeNodeMinHeight],
      shapeEllipse,
    );

    // Configure the layout of the graph
    const layout = sugiyama()
      .nodeSize([technologyTreeNodeMinHeight, technologyTreeNodeWidth])
      .gap([technologyTreeNodeMinHeight * 0.25, technologyTreeNodeWidth * 0.25])
      .tweaks([shape]);

    // Generate the graph layout to obtain its size
    const { width: height, height: width } = layout(graph);

    return {
      layoutWidth: width,
      layoutHeight: height,
      nodes: Array.from(graph.nodes()),
      links: Array.from(graph.links()),
    };
  }, [filteredTechnologyTreeData]);

  /** @todo: animate changes in the graph */

  return (
    <Box marginBottom={10}>
      <Container>
        <Typography id="technology-tree" variant="hashHeading3" gutterBottom>
          Technology Tree
        </Typography>
      </Container>
      <Box
        sx={{
          width: "100%",
          height: 4,
          background:
            "linear-gradient(90deg, rgba(0, 141, 185, 0.00) 0%, #5DBEDC 20.83%, #DAF8FF 84.90%, rgba(218, 248, 255, 0.00) 100%)",
        }}
      />
      <Box position="relative">
        <Box
          sx={{
            width: "100%",
            background:
              "linear-gradient(90deg, rgba(247, 250, 252, 0.00) 0%, #F7FAFC 10.94%, #F7FAFC 84.90%, rgba(247, 250, 252, 0.00) 100%)",
            overflowX: "scroll",
          }}
        >
          <Container
            sx={{ position: "relative", paddingTop: 4, paddingBottom: 8 }}
          >
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
              }}
            >
              {nodes.map(({ x, y, data }) => (
                <TechnologyTreeNode
                  key={data.id}
                  x={x}
                  y={y}
                  data={data}
                  blurred={blurredNodes.includes(data.id)}
                  onHover={() => setFocusedNodeId(data.id)}
                  onUnhover={() => setFocusedNodeId(undefined)}
                />
              ))}
            </Box>
            <Box
              component="svg"
              sx={{
                position: "relative",
                width: layoutWidth + 4,
                height: layoutHeight + 4,
              }}
            >
              <g transform="translate(2, 2)">
                <defs id="defs">
                  <marker
                    id="arrow-head"
                    refX="6"
                    refY="6"
                    markerWidth="10"
                    markerHeight="16"
                    markerUnits="userSpaceOnUse"
                    orient="auto-start-reverse"
                  >
                    <Box
                      component="path"
                      d="M 1 1 L 6 6 L 1 11.25"
                      fill="none"
                      stroke="blue"
                      strokeWidth="1"
                      sx={{ stroke: ({ palette }) => palette.gray[40] }}
                    />
                  </marker>
                </defs>
                <g id="links">
                  {links.map(({ source, target, points }) => {
                    // Shift points to start from right side of source node and end at left side of target node
                    const shiftedPoints = points.map<[number, number]>(
                      ([x, y], index) => {
                        if (index === 0) {
                          // this is the start point of the edge
                          return [y + technologyTreeNodeWidth / 2 - 60, x];
                        } else if (index === points.length - 1) {
                          // this is the end point of the edge
                          return [y - technologyTreeNodeWidth / 2 + 48, x];
                        } else {
                          return [y, x];
                        }
                      },
                    );

                    const pathD = generateLinePath(shiftedPoints) ?? undefined;

                    const opacity = blurredNodes.includes(source.data.id)
                      ? 0.2
                      : 1;

                    return (
                      <Box
                        component="path"
                        key={`${source.data.id}-${target.data.id}`}
                        d={pathD}
                        fill="none"
                        strokeWidth="1"
                        opacity={opacity}
                        markerEnd="url(#arrow-head)"
                        sx={{ stroke: ({ palette }) => palette.gray[40] }}
                      />
                    );
                  })}
                </g>
              </g>
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  );
};
