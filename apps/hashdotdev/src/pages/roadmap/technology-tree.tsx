import {
  Box,
  Container,
  Theme,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  curveMonotoneX,
  line as d3Line,
  select,
  zoom as d3zoom,
  zoomIdentity,
  ZoomTransform,
} from "d3";
import { graphStratify, shapeEllipse, sugiyama, tweakShape } from "d3-dag";
import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";

import { HiddenAnchorFragmentTag } from "../../components/hidden-anchor-fragment-tag";
import { TriangleExclamationLightIcon } from "../../components/icons/triangle-exclamation-light-icon";
import { statuses, StatusId } from "./statuses";
import { TechnologyTreeButtons } from "./technology-tree-buttons";
import {
  technologyTreeData,
  TechnologyTreeNodeData,
} from "./technology-tree-data";
import { TechnologyTreeFilters } from "./technology-tree-filters";
import {
  TechnologyTreeNode,
  technologyTreeNodeWidth,
} from "./technology-tree-node";
import { UseCaseId, useCases } from "./use-cases";
import { VariantId, variants } from "./variants";

const technologyTreeNodeMinHeight = 50;

const generateLinePath = d3Line().curve(curveMonotoneX);

export const TechnologyTree: FunctionComponent = () => {
  const graphWrapperRef = useRef<Element>(null);
  const graphRef = useRef<Element>(null);

  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>();

  const fullScreenHandle = useFullScreenHandle();

  const [displayFilters, setDisplayFilters] = useState(false);

  const [displayedStatuses, setDisplayedStatuses] = useState<StatusId[]>(
    statuses.map(({ id }) => id),
  );
  const [displayedVariants, setDisplayedVariants] = useState<VariantId[]>(
    variants.map(({ id }) => id),
  );
  const [displayedUseCases, setDisplayedUseCases] = useState<UseCaseId[]>(
    useCases.map(({ id }) => id),
  );

  const filteredTechnologyTreeData = useMemo(() => {
    // Lookup map of id to node data
    const idToNode = new Map<string, TechnologyTreeNodeData>(
      technologyTreeData.map((node) => [node.id, node]),
    );

    // The filtered list of nodes
    const filteredNodes = technologyTreeData.filter(
      (node) =>
        displayedStatuses.includes(node.status) &&
        displayedVariants.includes(node.variant) &&
        node.useCases.some((useCase) => displayedUseCases.includes(useCase)),
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
  }, [displayedStatuses, displayedVariants, displayedUseCases]);

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
      .gap([technologyTreeNodeMinHeight * 2.25, technologyTreeNodeWidth * 0.3])
      .tweaks([shape]);

    // Generate the graph layout to obtain its size
    const { width: height, height: width } = layout(graph);

    return {
      layoutWidth: width,
      layoutHeight: height,
      nodes: Array.from(graph.nodes()),
      links: Array.from(graph.links()).filter(
        /** Ensure there aren't any duplicate edges between nodes in the graph */
        (link, i, all) =>
          all.findIndex(
            ({ source, target }) =>
              source.data.id === link.source.data.id &&
              target.data.id === link.target.data.id,
          ) === i,
      ),
    };
  }, [filteredTechnologyTreeData]);

  useEffect(() => {
    if (graphRef.current && graphWrapperRef.current) {
      const graphWrapper = select(graphWrapperRef.current);
      const graph = select(graphRef.current);

      const { height: initialWrapperHeight } =
        graphWrapperRef.current.getBoundingClientRect();

      const zoom = d3zoom()
        .scaleExtent([
          0.25 * (layoutHeight / initialWrapperHeight),
          layoutHeight / initialWrapperHeight,
        ])
        .on("zoom", (event: { transform: ZoomTransform }) => {
          if (!graphWrapperRef.current) {
            return;
          }

          const { height: currentWrapperHeight, width: currentWrapperWidth } =
            graphWrapperRef.current.getBoundingClientRect();

          graph.style(
            "transform",
            `translate(${event.transform.x - currentWrapperWidth / 2}px, ${
              event.transform.y - layoutHeight / 2
            }px) scale(${
              event.transform.k * (currentWrapperHeight / layoutHeight)
            })`,
          );
        });

      const initialScale = 0.9;

      const initialTranslateX = 0;

      const initialTranslateY = initialWrapperHeight / 2;

      graphWrapper.call((selection) =>
        zoom.transform(
          selection,
          zoomIdentity
            .translate(initialTranslateX, initialTranslateY)
            .scale(initialScale),
        ),
      );

      graphWrapper.call(zoom);

      // @todo fix selection / zoom issues after resizing/fullscreen switch
    }
  }, [layoutHeight, layoutWidth, fullScreenHandle.active]);

  /** @todo: animate changes in the graph */

  const useWidescreenFilters = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.up(1960),
  );

  const isMobile = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md"),
  );

  useEffect(() => {
    setDisplayFilters(!isMobile);
  }, [isMobile]);

  return (
    <Box marginBottom={10}>
      <Container>
        <HiddenAnchorFragmentTag id="technology-tree" />
        <Typography id="" variant="hashHeading3" marginBottom={4}>
          Technology Tree
        </Typography>
        <Typography marginBottom={4}>
          Inspired by the “tech trees” of video games like Civilization, we’ve
          broken down the key components required to build HASH into a tree-view
          below. You can filter these by use case to see what’s left to be built
          unblocking a particular use case, or slice the data by work area or
          completion status.
        </Typography>
      </Container>
      <Container
        sx={{
          maxWidth: {
            lg: 1500,
          },
        }}
      >
        <FullScreen handle={fullScreenHandle}>
          <Box
            sx={{
              position: "relative",
              overflow: useWidescreenFilters ? "unset" : "hidden",
              borderWidth: useWidescreenFilters ? 0 : 1,
              borderStyle: "solid",
              borderColor: ({ palette }) => palette.gray[30],
              borderRadius: "8px",
            }}
          >
            <TechnologyTreeButtons
              isDisplayingFilters={displayFilters}
              toggleDisplayFilters={() => setDisplayFilters((prev) => !prev)}
              isFullscreen={fullScreenHandle.active}
              toggleFullscreen={() =>
                fullScreenHandle.active
                  ? fullScreenHandle.exit()
                  : fullScreenHandle.enter()
              }
              hidden={false}
            />
            <TechnologyTreeFilters
              open={displayFilters}
              onClose={() => setDisplayFilters(false)}
              isWideScreen={useWidescreenFilters && !fullScreenHandle.active}
              displayedStatuses={displayedStatuses}
              setDisplayedStatuses={setDisplayedStatuses}
              displayedVariants={displayedVariants}
              setDisplayedVariants={setDisplayedVariants}
              displayedUseCases={displayedUseCases}
              setDisplayedUseCases={setDisplayedUseCases}
            />
            <Box
              sx={{
                zIndex: 1,
                position: "relative",
                overflow: "hidden",
                background: "#F7FAFC",
                borderWidth: useWidescreenFilters ? 1 : 0,
                borderStyle: "solid",
                borderColor: ({ palette }) => palette.gray[30],
                borderRadius: "8px",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: 4,
                  background:
                    "linear-gradient(90deg, rgba(0, 141, 185, 0.20) 0%, #5DBEDC 20.83%, #DAF8FF 84.90%, rgba(218, 248, 255, 0.20) 100%)",
                }}
              />
              {nodes.length === 0 ? (
                <Box
                  sx={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 1,
                    textAlign: "center",
                  }}
                >
                  <TriangleExclamationLightIcon
                    sx={{
                      fontSize: 42,
                      color: ({ palette }) => palette.gray[50],
                      marginBottom: 1,
                    }}
                  />
                  <Typography
                    sx={{
                      fontSize: 15,
                      color: ({ palette }) => palette.gray[90],
                      fontWeight: 500,
                    }}
                  >
                    No roadmap items match your current filters
                  </Typography>
                  {displayedStatuses.length === 0 ||
                  displayedVariants.length === 0 ||
                  displayedUseCases.length === 0 ? (
                    <Typography
                      sx={{
                        fontSize: 14,
                        color: ({ palette }) => palette.gray[70],
                        fontWeight: 400,
                      }}
                    >
                      Please select at least one{" "}
                      <strong>
                        {displayedStatuses.length === 0
                          ? "status"
                          : displayedVariants.length === 0
                            ? "type"
                            : "use case"}
                      </strong>{" "}
                      to view matching deliverables
                    </Typography>
                  ) : null}
                </Box>
              ) : null}
              <Box
                ref={graphWrapperRef}
                sx={{
                  position: "relative",
                  width: "100%",
                  overflow: "hidden",
                  height: fullScreenHandle.active ? "100vh" : "70vh",
                  borderBottomColor: ({ palette }) => palette.gray[20],
                  borderBottomStyle: "solid",
                  borderBottomWidth: 1,
                }}
              >
                <Box ref={graphRef}>
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
                        graphWrapperRef={graphWrapperRef}
                        blurred={blurredNodes.includes(data.id)}
                        selected={
                          focusedNodeId !== undefined &&
                          focusedNodeId === data.id
                        }
                        onSelected={() => setFocusedNodeId(data.id)}
                        onDeselected={() => setFocusedNodeId(undefined)}
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
                                return [
                                  y + technologyTreeNodeWidth / 2 - 27,
                                  x,
                                ];
                              } else if (index === points.length - 1) {
                                // this is the end point of the edge
                                return [
                                  y - technologyTreeNodeWidth / 2 + 18,
                                  x,
                                ];
                              } else {
                                return [y, x];
                              }
                            },
                          );

                          const pathD =
                            generateLinePath(shiftedPoints) ?? undefined;

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
                </Box>
              </Box>
            </Box>
          </Box>
        </FullScreen>
      </Container>
    </Box>
  );
};
