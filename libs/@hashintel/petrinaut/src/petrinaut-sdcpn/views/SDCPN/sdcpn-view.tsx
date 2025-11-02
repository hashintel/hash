import "reactflow/dist/style.css";

import type { DragEvent } from "react";
import { useRef, useState } from "react";
import type { Connection, ReactFlowInstance } from "reactflow";
import ReactFlow, { Background, ConnectionLineType } from "reactflow";
import { v4 as generateUuid } from "uuid";

import { useEditorStore } from "../../state/editor-provider";
import { useSDCPNStore } from "../../state/sdcpn-provider";
import type { ArcData, NodeData } from "../../state/types-for-editor-to-remove";
import { Arc } from "./components/arc";
import { PlaceNode } from "./components/place-node";
import { TransitionNode } from "./components/transition-node";
import { useApplyNodeChanges } from "./hooks/use-apply-node-changes";
import { useSdcpnToReactFlow } from "./hooks/use-sdcpn-to-react-flow";
import { nodeDimensions } from "./styles/styling";

const SNAP_GRID_SIZE = 15;

const REACTFLOW_NODE_TYPES = {
  place: PlaceNode,
  transition: TransitionNode,
};

const REACTFLOW_EDGE_TYPES = {
  default: Arc,
};

/**
 * SDCPNView is responsible for rendering the SDCPN using ReactFlow.
 * It reads from sdcpn-store and editor-store, and handles all ReactFlow interactions.
 */
export const SDCPNView: React.FC = () => {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    NodeData,
    ArcData
  > | null>(null);

  // SDCPN store
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const addPlace = useSDCPNStore((state) => state.addPlace);
  const addTransition = useSDCPNStore((state) => state.addTransition);
  const addArc = useSDCPNStore((state) => state.addArc);

  // Hook for applying node changes
  const applyNodeChanges = useApplyNodeChanges();

  // Convert SDCPN to ReactFlow format with dragging state
  const { nodes, arcs } = useSdcpnToReactFlow(sdcpn);

  // Editor state
  const clearSelection = useEditorStore((state) => state.clearSelection);

  function onEdgesChange() {
    /**
     * There are no edge changes we need to process at the moment:
     * - We add arcs in onConnect, we won't don't process 'add'
     * - We don't allow removing arcs at the moment
     * - We handle selection in separate state when an edge is clicked
     * - Unclear what 'reset' is supposed to do
     */
  }

  function isValidConnection(connection: Connection) {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);

    if (!sourceNode || !targetNode) {
      return false;
    }

    // Places can only connect to transitions and vice versa
    return sourceNode.type !== targetNode.type;
  }

  function onConnect(connection: Connection) {
    if (!isValidConnection(connection)) {
      return;
    }

    const source = connection.source ?? "";
    const target = connection.target ?? "";

    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);

    if (!sourceNode || !targetNode) {
      return;
    }

    // Determine direction: place->transition or transition->place
    if (sourceNode.type === "place" && targetNode.type === "transition") {
      // Input arc: place to transition
      addArc(target, "input", source, 1);
    } else if (
      sourceNode.type === "transition" &&
      targetNode.type === "place"
    ) {
      // Output arc: transition to place
      addArc(source, "output", target, 1);
    }
  }

  function onInit(instance: ReactFlowInstance<NodeData, ArcData>) {
    setReactFlowInstance(instance);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = "move";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!reactFlowInstance || !canvasContainer.current) {
      return;
    }

    const reactFlowBounds = canvasContainer.current.getBoundingClientRect();
    const nodeType = event.dataTransfer.getData("application/reactflow") as
      | "place"
      | "transition";

    const { width, height } = nodeDimensions[nodeType];

    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left - width / 2,
      y: event.clientY - reactFlowBounds.top - height / 2,
    });

    const id = `${nodeType}__${generateUuid()}`;
    const label = `${nodeType} ${nodes.length + 1}`;

    if (nodeType === "place") {
      addPlace({
        id,
        name: label,
        dimensions: 1,
        differentialEquationCode: "",
        x: position.x,
        y: position.y,
        width,
        height,
      });
    } else {
      addTransition({
        id,
        name: label,
        inputArcs: [],
        outputArcs: [],
        lambdaCode: "",
        transitionKernelCode: "",
        x: position.x,
        y: position.y,
        width,
        height,
      });
    }
  }

  function handlePaneClick() {
    clearSelection();
  }

  return (
    <div
      ref={canvasContainer}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={arcs}
        nodeTypes={REACTFLOW_NODE_TYPES}
        edgeTypes={REACTFLOW_EDGE_TYPES}
        onNodesChange={applyNodeChanges}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={handlePaneClick}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid
        snapGrid={[SNAP_GRID_SIZE, SNAP_GRID_SIZE]}
        connectionLineType={ConnectionLineType.SmoothStep}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={SNAP_GRID_SIZE} size={1} />
      </ReactFlow>
    </div>
  );
};
