import { use, useEffect, useRef, useState } from "react";

import { Button, TextInput } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  getStatusViewEvaluationScope,
  statusViewSchema,
  type InstanceStatus,
  type Place,
  type SDCPN,
  type StatusLabel,
  type StatusView,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../react";
import { ExecutionFrameSourceContext } from "../../../../react/execution-frame/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { StatusConditionArtifactsContext } from "../../../../react/status-condition-artifacts";
import {
  createBoardReplay,
  type BoardSnapshot,
} from "../kanban-view/board-replay";

// Prototype: board setup for a status view. Places map, board of statuses
// holding place chips, a tray for places without a status, and an inspector.
// Edits a draft of the view's labels; "Use this board" saves it through the
// same `updateStatusView` mutation the Status views drawer uses.

const PALETTE = [
  "#94a3b8",
  "#3b82f6",
  "#2563eb",
  "#733bf6",
  "#9333ea",
  "#0891b2",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#db2777",
  "#64748b",
];

const arcPlaceId = (arc: {
  placeId?: string;
  endpoint?: { kind: string; placeId?: string };
}): string | undefined =>
  arc.endpoint?.kind === "place" ? arc.endpoint.placeId : arc.placeId;

/** Places whose token type carries an element keyed by the view's identity. */
const getTrackedPlaceIds = (sdcpn: SDCPN, identityRef: string): Set<string> => {
  const trackedTypeIds = new Set(
    sdcpn.types
      .filter((type) =>
        type.elements.some((element) => element.identityRef === identityRef),
      )
      .map((type) => type.id),
  );
  return new Set(
    sdcpn.places
      .filter((place) => place.colorId && trackedTypeIds.has(place.colorId))
      .map((place) => place.id),
  );
};

// ---------------------------------------------------------------- styles

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
});
const toolbarClearanceStyle = css({ flexShrink: 0, height: "[96px]" });
const runBannerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "3",
  borderRadius: "lg",
  borderWidth: "[1px]",
  borderColor: "blue.s90",
  backgroundColor: "blue.s10",
  fontSize: "sm",
  color: "neutral.s120",
});
const headerStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "3",
  paddingBottom: "3",
  borderBottomWidth: "[1px]",
  borderColor: "neutral.bd.subtle",
});
const titleStyle = css({
  fontSize: "base",
  fontWeight: "semibold",
  color: "neutral.s120",
});
const subStyle = css({ fontSize: "xs", color: "neutral.s110" });
const growStyle = css({ flex: "[1]" });
const reasonStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "orange.s110",
});
const errorStyle = css({ fontSize: "xs", color: "red.s105" });
const layoutStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) 320px]",
  gap: "3",
  alignItems: "start",
});
const panelStyle = css({
  backgroundColor: "neutral.s00",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  padding: "4",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  minWidth: "[0]",
});
const panelHeadStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "2",
});
const panelTitleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});
const captionStyle = css({ fontSize: "[11px]", color: "neutral.s110" });
const faintStyle = css({ fontSize: "[11px]", color: "neutral.s90" });

const boardStyle = css({
  display: "flex",
  gap: "2",
  overflowX: "auto",
  alignItems: "stretch",
  minHeight: "[320px]",
  paddingBottom: "1",
});
const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  flex: "[1 1 0]",
  minWidth: "[168px]",
  maxWidth: "[240px]",
  padding: "2",
  borderRadius: "md",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s25",
});
const columnSelectedStyle = css({
  borderColor: "blue.s90",
  backgroundColor: "blue.s10",
});
const columnDropStyle = css({ borderColor: "blue.s90", borderStyle: "dashed" });
const columnRejectStyle = css({
  borderColor: "red.s105",
  borderStyle: "dashed",
});
const trayStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  flex: "[0 0 180px]",
  padding: "2",
  borderRadius: "md",
  borderWidth: "[1.5px]",
  borderStyle: "dashed",
  borderColor: "neutral.s90",
});
const columnHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "1",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  textAlign: "left",
  width: "full",
  cursor: "pointer",
});
const swatchStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "full",
  flexShrink: 0,
});
const countStyle = css({
  marginLeft: "auto",
  fontSize: "xs",
  color: "neutral.s90",
  fontWeight: "medium",
});
const chipStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "full",
  paddingX: "2",
  paddingY: "1",
  borderRadius: "md",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  backgroundColor: "neutral.s00",
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s110",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  cursor: "grab",
});
const chipNameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: "[0]",
});
const chipPickedStyle = css({
  outline: "[2px solid var(--colors-blue-s90)]",
  outlineOffset: "[1px]",
});
const chipNeedsStyle = css({
  backgroundColor: "orange.s20",
  borderColor: "orange.s30",
  borderStyle: "dashed",
  color: "neutral.s120",
});
const chipMutedStyle = css({
  borderStyle: "dashed",
  backgroundColor: "[transparent]",
  color: "neutral.s90",
  cursor: "default",
});
const placeIconStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "full",
  borderWidth: "[1px]",
  borderColor: "[currentColor]",
  flexShrink: 0,
});
const dividerStyle = css({
  height: "[1px]",
  backgroundColor: "neutral.bd.subtle",
});
const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  borderRadius: "sm",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.s00",
  shadow: "[0px 1px 3px rgba(0, 0, 0, 0.06)]",
});
const cardKeyStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s125",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const groupTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  color: "neutral.s110",
});
const warnTitleStyle = css({ color: "orange.s110" });
const moveHereStyle = css({
  borderWidth: "[1px]",
  borderStyle: "dashed",
  borderColor: "blue.s90",
  color: "blue.s100",
  borderRadius: "md",
  padding: "1",
  fontSize: "[11px]",
  fontWeight: "medium",
  cursor: "pointer",
});
const selectStyle = css({
  height: "[28px]",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  paddingX: "2",
  fontSize: "xs",
  backgroundColor: "neutral.s00",
  color: "neutral.s120",
  width: "full",
});
const identityButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2.5",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  fontSize: "xs",
  color: "neutral.s110",
  cursor: "pointer",
  backgroundColor: "neutral.s00",
});
const keyTagStyle = css({
  fontWeight: "medium",
  color: "neutral.s120",
  backgroundColor: "neutral.s25",
  borderRadius: "sm",
  paddingX: "1",
});
const identityPanelStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
  gap: "4",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  borderRadius: "lg",
  padding: "3",
});
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1" });
const inlineChipStyle = css({ width: "auto", cursor: "default" });
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
});
const swatchButtonStyle = css({
  width: "[22px]",
  height: "[22px]",
  borderRadius: "full",
  cursor: "pointer",
});
const swatchOnStyle = css({
  boxShadow:
    "[0 0 0 2px var(--colors-neutral-s00), 0 0 0 4px var(--colors-blue-s90)]",
});
const placeRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[32px]",
  paddingX: "2.5",
  borderWidth: "[1px]",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
});
const explainStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  backgroundColor: "neutral.s25",
  borderRadius: "lg",
  padding: "3",
  fontSize: "xs",
  color: "neutral.s110",
});
const mapStyle = css({ width: "full", display: "block" });
/** Place labels sit this far (in screen px) below the circle edge. */
const LABEL_OFFSET = 17;

// ---------------------------------------------------------------- map

const PlacesMap = ({
  sdcpn,
  labels,
  trackedPlaceIds,
  needsPlaceIds,
  selectedLabel,
  exitLabel,
  onSelectPlace,
  onMoveTag,
}: {
  sdcpn: SDCPN;
  labels: StatusLabel[];
  trackedPlaceIds: Set<string>;
  needsPlaceIds: Set<string>;
  selectedLabel: StatusLabel | undefined;
  exitLabel: StatusLabel | undefined;
  onSelectPlace: (placeId: string) => void;
  /** A status tag was dropped on another place, or on empty map (null). */
  onMoveTag: (
    labelId: string,
    fromPlaceId: string,
    toPlaceId: string | null,
  ) => void;
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    labelId: string;
    fromPlaceId: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = svgRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { places, transitions } = sdcpn;
  if (places.length === 0) {
    return <span className={faintStyle}>This net has no places.</span>;
  }
  const byId = new Map(places.map((place) => [place.id, place]));
  const exits = transitions.filter((transition) =>
    transition.outputArcs.every((arc) => !byId.has(arcPlaceId(arc) ?? "")),
  );
  const xs = [
    ...places.map((place) => place.x),
    ...transitions.map((transition) => transition.x),
    ...exits.map((transition) => transition.x + 190),
  ];
  const ys = [
    ...places.map((place) => place.y),
    ...transitions.map((transition) => transition.y),
  ];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(1, Math.max(...ys) - minY);
  const height = Math.min(360, Math.max(220, (spanY / spanX) * width + 110));
  const unit = 1 / Math.min((width - 200) / spanX, (height - 110) / spanY);
  const padX = 100 * unit;
  const viewBox = `${minX - padX} ${minY - 60 * unit} ${spanX + 2 * padX} ${spanY + 110 * unit}`;
  const radius = 15 * unit;
  const barHalfWidth = 4 * unit;
  const stroke = 1.25 * unit;
  const labelOf = (placeId: string) =>
    labels.find((label) => label.places.includes(placeId));
  const selected = new Set(selectedLabel?.places ?? []);

  const trim = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    trimStart: number,
    trimEnd: number,
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x1: ax + (dx / length) * trimStart,
      y1: ay + (dy / length) * trimStart,
      x2: bx - (dx / length) * trimEnd,
      y2: by - (dy / length) * trimEnd,
    };
  };

  type Box = { x1: number; y1: number; x2: number; y2: number };
  const overlaps = (a: Box, b: Box) =>
    a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const tagHeight = 17 * unit;
  const obstacles: Box[] = places.flatMap((place) => {
    const labelWidth = place.name.length * 6.2 * unit;
    const labelTop = place.y + radius + (LABEL_OFFSET - 10) * unit;
    return [
      {
        x1: place.x - labelWidth / 2,
        y1: labelTop,
        x2: place.x + labelWidth / 2,
        y2: labelTop + 13 * unit,
      },
      {
        x1: place.x - radius,
        y1: place.y - radius,
        x2: place.x + radius,
        y2: place.y + radius,
      },
    ];
  });
  /** Tag position per place: the first nearby spot that hits nothing. */
  const tagLayout = new Map<
    string,
    {
      text: string;
      centerX: number;
      top: number;
      width: number;
      moved: boolean;
    }
  >();
  for (const place of places) {
    const label = labels.find((candidate) =>
      candidate.places.includes(place.id),
    );
    const text = label
      ? label.name || "Unnamed"
      : needsPlaceIds.has(place.id)
        ? "Needs a decision"
        : null;
    if (!text) {
      continue;
    }
    const tagWidth = (text.length * 6 + (label ? 22 : 12)) * unit;
    const baseTop = place.y - radius - 7 * unit - tagHeight;
    const shift = tagWidth / 2 + 6 * unit;
    const candidates = [
      [0, 0],
      [0, -20 * unit],
      [-shift, 0],
      [shift, 0],
      [0, -40 * unit],
      [-shift, -20 * unit],
      [shift, -20 * unit],
    ] as const;
    let chosen = { centerX: place.x, top: baseTop, moved: false };
    for (const [dx, dy] of candidates) {
      const box = {
        x1: place.x + dx - tagWidth / 2 - 2 * unit,
        y1: baseTop + dy - 2 * unit,
        x2: place.x + dx + tagWidth / 2 + 2 * unit,
        y2: baseTop + dy + tagHeight + 2 * unit,
      };
      if (!obstacles.some((obstacle) => overlaps(box, obstacle))) {
        chosen = {
          centerX: place.x + dx,
          top: baseTop + dy,
          moved: dx !== 0 || dy !== 0,
        };
        break;
      }
    }
    obstacles.push({
      x1: chosen.centerX - tagWidth / 2,
      y1: chosen.top,
      x2: chosen.centerX + tagWidth / 2,
      y2: chosen.top + tagHeight,
    });
    tagLayout.set(place.id, { text, width: tagWidth, ...chosen });
  }

  const toSvgPoint = (event: React.PointerEvent) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) {
      return null;
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  };
  /** Soft snap: the nearest tracked place within reach of the dragged tag. */
  const snapTarget = drag
    ? places
        .filter((place) => trackedPlaceIds.has(place.id))
        .map((place) => ({
          place,
          distance: Math.hypot(
            place.x - drag.x,
            place.y - radius - 16 * unit - drag.y,
          ),
        }))
        .filter((entry) => entry.distance < 48 * unit)
        .sort((left, right) => left.distance - right.distance)[0]?.place
    : undefined;
  const draggedLabel = drag
    ? labels.find((label) => label.id === drag.labelId)
    : undefined;

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!drag) {
      return;
    }
    const point = toSvgPoint(event);
    if (point) {
      setDrag({ ...drag, ...point, moved: true });
    }
  };
  const handlePointerUp = () => {
    if (!drag) {
      return;
    }
    if (drag.moved) {
      const target = snapTarget?.id ?? null;
      if (target !== drag.fromPlaceId) {
        onMoveTag(drag.labelId, drag.fromPlaceId, target);
      }
    } else {
      onSelectPlace(drag.fromPlaceId);
    }
    setDrag(null);
  };

  const ghost = (() => {
    if (!drag?.moved || !draggedLabel) {
      return null;
    }
    const text = draggedLabel.name || "Unnamed";
    const ghostWidth = (text.length * 6 + 22) * unit;
    const ghostHeight = 17 * unit;
    const centerX = snapTarget ? snapTarget.x : drag.x;
    const top = snapTarget
      ? snapTarget.y - radius - 7 * unit - ghostHeight
      : drag.y - ghostHeight / 2;
    return (
      <g pointerEvents="none">
        {snapTarget && (
          <circle
            cx={snapTarget.x}
            cy={snapTarget.y}
            r={radius + 4 * unit}
            fill="none"
            stroke="var(--colors-blue-s90)"
            strokeWidth={2 * unit}
            strokeDasharray={`${4 * unit} ${3 * unit}`}
          />
        )}
        <rect
          x={centerX - ghostWidth / 2}
          y={top}
          width={ghostWidth}
          height={ghostHeight}
          rx={4 * unit}
          fill="var(--colors-neutral-s00)"
          stroke="var(--colors-blue-s90)"
          strokeWidth={1.5 * unit}
        />
        <circle
          cx={centerX - ghostWidth / 2 + 8 * unit}
          cy={top + ghostHeight / 2}
          r={3 * unit}
          fill={draggedLabel.displayColor}
        />
        <text
          x={centerX + 5 * unit}
          y={top + ghostHeight / 2 + 3.6 * unit}
          fontSize={10.5 * unit}
          fontWeight={500}
          textAnchor="middle"
          fill="var(--colors-neutral-s120)"
        >
          {text}
        </text>
      </g>
    );
  })();

  return (
    <svg
      ref={svgRef}
      className={mapStyle}
      style={{ height, touchAction: "none" }}
      viewBox={viewBox}
      role="group"
      aria-label="Places map. Drag a status tag onto another place to move that status there."
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <marker
          id="board-setup-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={8 * unit}
          markerHeight={8 * unit}
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path
            d="M1 1 L9 5 L1 9"
            fill="none"
            stroke="var(--colors-neutral-s90)"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      {transitions.flatMap((transition) => [
        ...transition.inputArcs.map((arc) => {
          const place = byId.get(arcPlaceId(arc) ?? "");
          if (!place) {
            return null;
          }
          return (
            <line
              key={`${transition.id}:in:${place.id}`}
              {...trim(
                place.x,
                place.y,
                transition.x,
                transition.y,
                radius + unit,
                barHalfWidth + 3 * unit,
              )}
              stroke="var(--colors-neutral-s90)"
              strokeWidth={stroke}
              markerEnd="url(#board-setup-arrow)"
            />
          );
        }),
        ...transition.outputArcs.map((arc) => {
          const place = byId.get(arcPlaceId(arc) ?? "");
          if (!place) {
            return null;
          }
          return (
            <line
              key={`${transition.id}:out:${place.id}`}
              {...trim(
                transition.x,
                transition.y,
                place.x,
                place.y,
                barHalfWidth + unit,
                radius + 3 * unit,
              )}
              stroke="var(--colors-neutral-s90)"
              strokeWidth={stroke}
              markerEnd="url(#board-setup-arrow)"
            />
          );
        }),
      ])}
      {exits.map((transition) => (
        <g key={`${transition.id}-exit`}>
          <line
            x1={transition.x + barHalfWidth + unit}
            y1={transition.y}
            x2={transition.x + 190 - radius * 0.8 - 3 * unit}
            y2={transition.y}
            stroke="var(--colors-neutral-s90)"
            strokeWidth={stroke}
            strokeDasharray={`${5 * unit} ${4 * unit}`}
            markerEnd="url(#board-setup-arrow)"
          />
          <circle
            cx={transition.x + 190}
            cy={transition.y}
            r={radius * 0.8}
            fill="none"
            stroke="var(--colors-neutral-s90)"
            strokeWidth={stroke}
            strokeDasharray={`${4 * unit} ${3 * unit}`}
          />
          <text
            x={transition.x + 190}
            y={transition.y + radius + 15 * unit}
            fontSize={10.5 * unit}
            textAnchor="middle"
            fill="var(--colors-neutral-s90)"
          >
            Leaves the process
          </text>
          {exitLabel && (
            <text
              x={transition.x + 190}
              y={transition.y + radius + 29 * unit}
              fontSize={10.5 * unit}
              textAnchor="middle"
              fill="var(--colors-neutral-s90)"
            >
              shows in {exitLabel.name}
            </text>
          )}
        </g>
      ))}
      {transitions.map((transition) => (
        <rect
          key={transition.id}
          x={transition.x - barHalfWidth}
          y={transition.y - 10 * unit}
          width={barHalfWidth * 2}
          height={20 * unit}
          rx={unit}
          fill="var(--colors-neutral-s100)"
        >
          <title>{transition.name}</title>
        </rect>
      ))}
      {places.map((place) => {
        const tracked = trackedPlaceIds.has(place.id);
        const label = labelOf(place.id);
        const needs = needsPlaceIds.has(place.id);
        return (
          <g key={place.id}>
            {selected.has(place.id) && (
              <circle
                cx={place.x}
                cy={place.y}
                r={radius + 4 * unit}
                fill="none"
                stroke="var(--colors-blue-s90)"
                strokeWidth={2 * unit}
              />
            )}
            <circle
              cx={place.x}
              cy={place.y}
              r={radius}
              fill="var(--colors-neutral-s00)"
              stroke={
                needs
                  ? "var(--colors-orange-s110)"
                  : tracked
                    ? "var(--colors-neutral-s110)"
                    : "var(--colors-neutral-s90)"
              }
              strokeWidth={stroke}
              strokeDasharray={
                tracked && !needs ? undefined : `${4 * unit} ${3 * unit}`
              }
              style={{ cursor: label ? "pointer" : "default" }}
              onClick={() => onSelectPlace(place.id)}
            >
              <title>{place.name}</title>
            </circle>
            <text
              x={place.x}
              y={place.y + radius + LABEL_OFFSET * unit}
              fontSize={11 * unit}
              fontWeight={tracked ? 500 : 400}
              textAnchor="middle"
              stroke="var(--colors-neutral-s00)"
              strokeWidth={3 * unit}
              strokeLinejoin="round"
              paintOrder="stroke"
              fill={
                tracked
                  ? "var(--colors-neutral-s120)"
                  : "var(--colors-neutral-s90)"
              }
            >
              {place.name}
            </text>
          </g>
        );
      })}

      {places.map((place) => {
        const label = labelOf(place.id);
        const needs = needsPlaceIds.has(place.id);
        const layout = tagLayout.get(place.id);
        const tagText = layout?.text ?? null;
        const tagWidth = layout?.width ?? 0;
        const tagX = layout?.centerX ?? place.x;
        const tagY = layout?.top ?? 0;
        return (
          <g key={`${place.id}:tag`}>
            {layout?.moved && (
              <line
                x1={place.x}
                y1={place.y - radius}
                x2={tagX}
                y2={tagY + tagHeight}
                stroke="var(--colors-neutral-s90)"
                strokeWidth={unit}
              />
            )}
            {tagText && (
              <g
                opacity={
                  drag?.fromPlaceId === place.id && drag.moved ? 0.35 : 1
                }
                style={{ cursor: label ? "grab" : "default" }}
                onPointerDown={(event) => {
                  if (!label) {
                    return;
                  }
                  const point = toSvgPoint(event);
                  if (!point) {
                    return;
                  }
                  svgRef.current?.setPointerCapture(event.pointerId);
                  setDrag({
                    labelId: label.id,
                    fromPlaceId: place.id,
                    ...point,
                    moved: false,
                  });
                }}
              >
                <title>
                  {label ? `Drag to move ${tagText} to another place` : tagText}
                </title>
                <rect
                  x={tagX - tagWidth / 2}
                  y={tagY}
                  width={tagWidth}
                  height={tagHeight}
                  rx={4 * unit}
                  fill={
                    needs
                      ? "var(--colors-orange-s20)"
                      : "var(--colors-neutral-s00)"
                  }
                  stroke={
                    needs
                      ? "var(--colors-orange-s30)"
                      : "var(--colors-neutral-a60)"
                  }
                  strokeWidth={unit}
                />
                {label && (
                  <circle
                    cx={tagX - tagWidth / 2 + 8 * unit}
                    cy={tagY + tagHeight / 2}
                    r={3 * unit}
                    fill={label.displayColor}
                  />
                )}
                <text
                  x={tagX + (label ? 5 * unit : 0)}
                  y={tagY + tagHeight / 2 + 3.6 * unit}
                  fontSize={10.5 * unit}
                  fontWeight={500}
                  textAnchor="middle"
                  fill={
                    needs
                      ? "var(--colors-orange-s110)"
                      : "var(--colors-neutral-s110)"
                  }
                >
                  {tagText}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {ghost}
    </svg>
  );
};

// ---------------------------------------------------------------- live cards

/**
 * Replays the current frame source through the DRAFT view, so cards move as
 * the draft changes. Null when there is no run or stream to replay.
 */
const useDraftBoard = (
  draftView: StatusView,
): { instances: InstanceStatus[] } | null => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { currentFrameIndex, currentFrameReader, getFramesInRange } = use(
    ExecutionFrameSourceContext,
  );
  const { statusConditions } = use(StatusConditionArtifactsContext);
  const [board, setBoard] = useState<BoardSnapshot | null>(null);

  useEffect(() => {
    if (!currentFrameReader) {
      return;
    }
    let cancelled = false;
    const { places, types } = getStatusViewEvaluationScope(petriNetDefinition);
    createBoardReplay({
      statusView: draftView,
      places,
      types,
      statusConditions,
    })
      .advanceTo(currentFrameIndex, getFramesInRange)
      .then((snapshot) => {
        if (!cancelled) {
          setBoard(snapshot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBoard(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    draftView,
    currentFrameIndex,
    currentFrameReader,
    getFramesInRange,
    petriNetDefinition,
    statusConditions,
  ]);

  return currentFrameReader ? board : null;
};

// ---------------------------------------------------------------- setup

export const BoardSetup = ({
  statusView,
  canClose,
  onClose,
}: {
  statusView: StatusView;
  /** False before any run: there is no live board to go back to. */
  canClose: boolean;
  onClose: () => void;
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { updateStatusView } = usePetrinautMutations();

  const [labels, setLabels] = useState<StatusLabel[]>(() =>
    statusView.labels.map((label) => ({ ...label, places: [...label.places] })),
  );
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | undefined>(
    statusView.labels.find((label) => !label.isExit)?.id,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragPlace = useRef<string | null>(null);

  const identity = (petriNetDefinition.identities ?? []).find(
    (candidate) => candidate.id === statusView.identityRef,
  );
  const keyElementName =
    petriNetDefinition.types
      .flatMap((type) => type.elements)
      .find((element) => element.identityRef === statusView.identityRef)
      ?.name ?? "key";
  const noun = (identity?.name ?? "item").toLowerCase();
  const trackedPlaceIds = getTrackedPlaceIds(
    petriNetDefinition,
    statusView.identityRef,
  );
  const places = petriNetDefinition.places;
  const placeById = new Map(places.map((place) => [place.id, place]));
  const labelOf = (placeId: string) =>
    labels.find((label) => label.places.includes(placeId));
  const exitLabel = labels.find((label) => label.isExit);
  const untrackedPlaces = places.filter(
    (place) => !trackedPlaceIds.has(place.id),
  );
  const unassigned = places.filter(
    (place) => trackedPlaceIds.has(place.id) && !labelOf(place.id),
  );
  const needs = unassigned.filter((place) => !leaving.has(place.id));
  const leavingPlaces = unassigned.filter((place) => leaving.has(place.id));
  const selectedLabel = labels.find((label) => label.id === selectedId);
  const nameCounts = new Map<string, number>();
  for (const label of labels) {
    const key = label.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const isDuplicate = (label: StatusLabel) =>
    (nameCounts.get(label.name.trim().toLowerCase()) ?? 0) > 1;

  const draftView: StatusView = { ...statusView, labels };
  const liveBoard = useDraftBoard(draftView);
  const dirty = JSON.stringify(labels) !== JSON.stringify(statusView.labels);

  const blocker =
    needs.length > 0
      ? `${needs.length} place${needs.length === 1 ? " needs" : "s need"} a decision`
      : labels.some((label) => !label.name.trim())
        ? "A status has no name"
        : labels.some(isDuplicate)
          ? "Two statuses share a name"
          : null;

  const movePlace = (placeId: string, labelId: string) => {
    const target = labels.find((label) => label.id === labelId);
    if (!target) {
      return;
    }
    if (target.isExit) {
      setRejectId(labelId);
      setTimeout(() => setRejectId(null), 2600);
      return;
    }
    setLabels((current) =>
      current.map((label) => ({
        ...label,
        places:
          label.id === labelId
            ? [...label.places.filter((id) => id !== placeId), placeId]
            : label.places.filter((id) => id !== placeId),
      })),
    );
    setLeaving((current) => {
      const next = new Set(current);
      next.delete(placeId);
      return next;
    });
    setPicked(null);
    setSelectedId(labelId);
  };

  const unassign = (placeId: string) => {
    setLabels((current) =>
      current.map((label) => ({
        ...label,
        places: label.places.filter((id) => id !== placeId),
      })),
    );
    setPicked(null);
  };

  const updateSelected = (patch: Partial<StatusLabel>) =>
    setLabels((current) =>
      current.map((label) =>
        label.id === selectedId ? { ...label, ...patch } : label,
      ),
    );

  const addStatus = () => {
    const used = new Set(labels.map((label) => label.displayColor));
    const label: StatusLabel = {
      id: crypto.randomUUID(),
      name: "New status",
      displayColor: PALETTE.find((color) => !used.has(color)) ?? PALETTE[0]!,
      places: [],
    };
    setLabels((current) => {
      const exitIndex = current.findIndex((candidate) => candidate.isExit);
      if (exitIndex < 0) {
        return [...current, label];
      }
      return [
        ...current.slice(0, exitIndex),
        label,
        ...current.slice(exitIndex),
      ];
    });
    setSelectedId(label.id);
  };

  const deleteSelected = () => {
    setLabels((current) => current.filter((label) => label.id !== selectedId));
    setSelectedId(
      labels.find((label) => label.id !== selectedId && !label.isExit)?.id,
    );
    setConfirmDelete(false);
  };

  const save = () => {
    const parsed = statusViewSchema.safeParse(draftView);
    if (!parsed.success) {
      setSaveError(
        parsed.error.issues[0]?.message ?? "The board is not valid.",
      );
      return;
    }
    updateStatusView({
      statusViewId: statusView.id,
      update: { labels: parsed.data.labels },
    });
    setSaveError(null);
    if (canClose) {
      onClose();
    }
  };

  const discard = () => {
    setLabels(
      statusView.labels.map((label) => ({
        ...label,
        places: [...label.places],
      })),
    );
    setLeaving(new Set());
    setPicked(null);
    setSaveError(null);
  };

  const cardsFor = (labelId: string) =>
    liveBoard?.instances.filter(
      (instance) => instance.currentLabelId === labelId,
    ) ?? [];

  const chip = (place: Place, variant?: "needs") => {
    const tracked = trackedPlaceIds.has(place.id);
    if (!tracked) {
      return (
        <div
          key={place.id}
          className={cx(chipStyle, chipMutedStyle)}
          title={place.name}
        >
          <span className={placeIconStyle} />
          <span className={chipNameStyle}>{place.name}</span>
        </div>
      );
    }
    return (
      <button
        key={place.id}
        type="button"
        draggable
        aria-pressed={picked === place.id}
        title={`${place.name}. Drag to a status, or click and then click a status.`}
        className={cx(
          chipStyle,
          variant === "needs" && chipNeedsStyle,
          picked === place.id && chipPickedStyle,
        )}
        onClick={() => {
          setPicked((current) => (current === place.id ? null : place.id));
          const label = labelOf(place.id);
          if (label) {
            setSelectedId(label.id);
          }
        }}
        onDragStart={(event) => {
          dragPlace.current = place.id;
          const { dataTransfer } = event;
          dataTransfer.setData("text/plain", place.id);
          dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          dragPlace.current = null;
          setDragOver(null);
        }}
      >
        <span className={placeIconStyle} />
        <span className={chipNameStyle}>{place.name}</span>
      </button>
    );
  };

  const dropZone = (zoneId: string, onDrop: (placeId: string) => void) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragPlace.current) {
        return;
      }
      event.preventDefault();
      setDragOver(zoneId);
    },
    onDragLeave: () =>
      setDragOver((current) => (current === zoneId ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const placeId = dragPlace.current;
      dragPlace.current = null;
      setDragOver(null);
      if (placeId) {
        onDrop(placeId);
      }
    },
  });

  const identityTypes = petriNetDefinition.types.map((type) => ({
    type,
    tracked: type.elements.some(
      (element) => element.identityRef === statusView.identityRef,
    ),
    places: places.filter((place) => place.colorId === type.id),
  }));
  const untypedPlaces = places.filter(
    (place) =>
      !place.colorId ||
      !petriNetDefinition.types.some((type) => type.id === place.colorId),
  );
  const ordered = [
    ...labels.filter((label) => !label.isExit),
    ...labels.filter((label) => label.isExit),
  ];

  return (
    <div className={rootStyle} data-kanban-interactive="">
      <div className={headerStyle}>
        <div>
          <div className={titleStyle}>Board setup · {statusView.name}</div>
          <div className={subStyle}>
            Prototype. Starts from this model's status view. Changes are saved
            only when you use the board.
          </div>
        </div>
        <div className={growStyle} />
        {canClose ? (
          <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
            {dirty ? "Discard changes" : "Show live board"}
          </Button>
        ) : (
          dirty && (
            <Button variant="subtle" tone="neutral" size="sm" onClick={discard}>
              Discard changes
            </Button>
          )
        )}
        {blocker ? (
          <span className={reasonStyle}>{blocker}</span>
        ) : (
          !dirty && <span className={faintStyle}>No changes yet</span>
        )}
        {saveError && <span className={errorStyle}>{saveError}</span>}
        <Button size="sm" disabled={blocker !== null || !dirty} onClick={save}>
          Use this board
        </Button>
      </div>

      {liveBoard === null && (
        <div className={runBannerStyle} role="status">
          <span>
            <b>No run yet.</b> This board is set up from the model. Run the
            simulation (▶ in the toolbar below) to see {noun}s move through it.
          </span>
        </div>
      )}

      <div className={layoutStyle}>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "3",
            minWidth: "[0]",
          })}
        >
          <section className={panelStyle}>
            <div className={panelHeadStyle}>
              <div>
                <div className={panelTitleStyle}>Places</div>
                <div className={captionStyle}>
                  The model at the editor's positions. The tag above each place
                  shows the status it feeds. Drag a tag onto another place to
                  move that status there.
                </div>
              </div>
            </div>
            <PlacesMap
              sdcpn={petriNetDefinition}
              labels={labels}
              trackedPlaceIds={trackedPlaceIds}
              needsPlaceIds={new Set(needs.map((place) => place.id))}
              selectedLabel={selectedLabel}
              exitLabel={exitLabel}
              onSelectPlace={(placeId) => {
                const label = labelOf(placeId);
                if (label) {
                  setSelectedId(label.id);
                }
              }}
              onMoveTag={(labelId, fromPlaceId, toPlaceId) => {
                unassign(fromPlaceId);
                if (toPlaceId) {
                  movePlace(toPlaceId, labelId);
                }
              }}
            />
          </section>

          <section className={panelStyle}>
            <div className={panelHeadStyle}>
              <div>
                <div className={panelTitleStyle}>Board</div>
                <div className={captionStyle}>
                  Each status holds the places that feed it. Drag a place to
                  another status, or click it and then click a status.
                </div>
              </div>
              <div
                className={css({
                  display: "flex",
                  gap: "2",
                  alignItems: "center",
                })}
              >
                <button
                  type="button"
                  className={identityButtonStyle}
                  aria-expanded={identityOpen}
                  onClick={() => setIdentityOpen((open) => !open)}
                >
                  <span>
                    One card per <b>{noun}</b>, named by
                  </span>
                  <span className={keyTagStyle}>{keyElementName}</span>
                  <span
                    className={css({
                      color: "blue.s100",
                      fontWeight: "medium",
                    })}
                  >
                    {identityOpen ? "Close" : "Change"}
                  </span>
                </button>
                <Button
                  variant="subtle"
                  tone="neutral"
                  size="sm"
                  onClick={addStatus}
                >
                  Add status
                </Button>
              </div>
            </div>

            {identityOpen && (
              <div className={identityPanelStyle}>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Identity</span>
                  <span className={panelTitleStyle}>
                    {identity?.name ?? statusView.identityRef}
                  </span>
                  <span className={captionStyle}>
                    Tokens with the same {keyElementName} are one {noun}.
                  </span>
                  <span className={faintStyle}>
                    Identities are set on token types in Definitions. Change the
                    identity in the Status views drawer.
                  </span>
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Tracked</span>
                  {identityTypes
                    .filter((entry) => entry.tracked)
                    .map((entry) => (
                      <div key={entry.type.id} className={fieldStyle}>
                        <span className={groupTitleStyle}>
                          {entry.type.name}
                        </span>
                        <div className={chipRowStyle}>
                          {entry.places.map((place) => (
                            <span
                              key={place.id}
                              className={cx(chipStyle, inlineChipStyle)}
                            >
                              <span className={placeIconStyle} />
                              {place.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
                <div className={fieldStyle}>
                  <span className={labelStyle}>Not tracked</span>
                  {identityTypes
                    .filter(
                      (entry) => !entry.tracked && entry.places.length > 0,
                    )
                    .map((entry) => (
                      <div key={entry.type.id} className={fieldStyle}>
                        <span className={groupTitleStyle}>
                          {entry.type.name} · no {keyElementName}
                        </span>
                        <div className={chipRowStyle}>
                          {entry.places.map((place) => (
                            <span
                              key={place.id}
                              className={cx(
                                chipStyle,
                                chipMutedStyle,
                                inlineChipStyle,
                              )}
                            >
                              <span className={placeIconStyle} />
                              {place.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  {untypedPlaces.length > 0 && (
                    <div className={fieldStyle}>
                      <span className={groupTitleStyle}>No token type</span>
                      <div className={chipRowStyle}>
                        {untypedPlaces.map((place) => (
                          <span
                            key={place.id}
                            className={cx(
                              chipStyle,
                              chipMutedStyle,
                              inlineChipStyle,
                            )}
                          >
                            <span className={placeIconStyle} />
                            {place.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={boardStyle}>
              <div
                className={cx(
                  trayStyle,
                  dragOver === "tray" && columnDropStyle,
                )}
                {...dropZone("tray", unassign)}
              >
                <span className={labelStyle}>Not on the board</span>
                {untrackedPlaces.length > 0 && (
                  <>
                    <span className={groupTitleStyle}>No {keyElementName}</span>
                    {untrackedPlaces.map((place) => chip(place))}
                    <span className={faintStyle}>
                      Tokens here are not {noun}s. They never show on the board.
                    </span>
                  </>
                )}
                {needs.length > 0 && (
                  <>
                    <div className={dividerStyle} />
                    <span className={cx(groupTitleStyle, warnTitleStyle)}>
                      Needs a decision
                    </span>
                    {needs.map((place) => (
                      <div key={place.id} className={fieldStyle}>
                        {chip(place, "needs")}
                        <span
                          className={css({
                            fontSize: "[11px]",
                            fontWeight: "medium",
                            color: "neutral.s120",
                          })}
                        >
                          Its {noun}s would{" "}
                          {exitLabel
                            ? `show in ${exitLabel.name}`
                            : "drop off the board"}
                          .
                        </span>
                        <select
                          className={selectStyle}
                          aria-label={`Choose a status for ${place.name}`}
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              movePlace(place.id, event.target.value);
                            }
                          }}
                        >
                          <option value="">Choose status…</option>
                          {labels
                            .filter((label) => !label.isExit)
                            .map((label) => (
                              <option key={label.id} value={label.id}>
                                {label.name || "Unnamed"}
                              </option>
                            ))}
                        </select>
                        <Button
                          variant="subtle"
                          tone="neutral"
                          size="xs"
                          onClick={() =>
                            setLeaving((current) =>
                              new Set(current).add(place.id),
                            )
                          }
                        >
                          Mark as leaving
                        </Button>
                      </div>
                    ))}
                  </>
                )}
                {leavingPlaces.length > 0 && (
                  <>
                    <div className={dividerStyle} />
                    <span className={groupTitleStyle}>
                      {exitLabel ? "Leaves the process" : "Leaves the board"}
                    </span>
                    {leavingPlaces.map((place) => (
                      <div key={place.id} className={fieldStyle}>
                        {chip(place)}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setLeaving((current) => {
                              const next = new Set(current);
                              next.delete(place.id);
                              return next;
                            })
                          }
                        >
                          Undo
                        </Button>
                      </div>
                    ))}
                  </>
                )}
                {picked && (
                  <button
                    type="button"
                    className={moveHereStyle}
                    onClick={() => unassign(picked)}
                  >
                    Move here
                  </button>
                )}
              </div>

              {ordered.map((label) => {
                const cards = cardsFor(label.id);
                return (
                  <div
                    key={label.id}
                    className={cx(
                      columnStyle,
                      selectedId === label.id && columnSelectedStyle,
                      dragOver === label.id && columnDropStyle,
                      rejectId === label.id && columnRejectStyle,
                    )}
                    {...dropZone(label.id, (placeId) =>
                      movePlace(placeId, label.id),
                    )}
                  >
                    <button
                      type="button"
                      className={columnHeaderStyle}
                      aria-pressed={selectedId === label.id}
                      onClick={() => {
                        if (picked) {
                          movePlace(picked, label.id);
                          return;
                        }
                        setSelectedId(label.id);
                        setConfirmDelete(false);
                      }}
                    >
                      <span
                        className={swatchStyle}
                        style={{ backgroundColor: label.displayColor }}
                      />
                      {label.name || "Unnamed"}
                      <span className={countStyle}>
                        {label.isExit ? "Exit" : liveBoard ? cards.length : ""}
                      </span>
                    </button>
                    {label.isExit ? (
                      <>
                        <div
                          className={cx(
                            chipStyle,
                            chipMutedStyle,
                            css({ justifyContent: "center" }),
                          )}
                        >
                          Leaves the process
                        </div>
                        <span
                          className={
                            rejectId === label.id ? errorStyle : faintStyle
                          }
                        >
                          {rejectId === label.id
                            ? `An exit status holds no places. ${noun.charAt(0).toUpperCase() + noun.slice(1)}s land here when they leave every place on the board.`
                            : "Exit status. Holds no places."}
                        </span>
                      </>
                    ) : (
                      <>
                        {label.places.map((placeId) => {
                          const place = placeById.get(placeId);
                          return place ? (
                            chip(place)
                          ) : (
                            <div
                              key={placeId}
                              className={cx(chipStyle, chipMutedStyle)}
                            >
                              {placeId}
                            </div>
                          );
                        })}
                        {picked && !label.places.includes(picked) && (
                          <button
                            type="button"
                            className={moveHereStyle}
                            onClick={() => movePlace(picked, label.id)}
                          >
                            Move here
                          </button>
                        )}
                        {label.places.length === 0 && !picked && (
                          <span className={faintStyle}>
                            No places. Drag one here.
                          </span>
                        )}
                        {label.tokenCondition && (
                          <span className={faintStyle}>
                            Rule: {label.tokenCondition}
                          </span>
                        )}
                      </>
                    )}
                    <div className={dividerStyle} />
                    {cards.map((instance) => (
                      <div key={instance.key} className={cardStyle}>
                        <div className={cardKeyStyle}>
                          {instance.keyValues.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className={panelStyle}>
          {selectedLabel ? (
            <>
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "2",
                })}
              >
                <span
                  className={swatchStyle}
                  style={{ backgroundColor: selectedLabel.displayColor }}
                />
                <span className={titleStyle}>
                  {selectedLabel.name || "Unnamed"}
                </span>
                <span className={cx(countStyle)}>
                  {selectedLabel.isExit
                    ? "Exit status"
                    : `Status ${labels.indexOf(selectedLabel) + 1} of ${labels.length}`}
                </span>
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Name</span>
                <TextInput
                  size="sm"
                  value={selectedLabel.name}
                  onChange={(value) => updateSelected({ name: value })}
                />
                {!selectedLabel.name.trim() ? (
                  <span className={errorStyle}>Give this status a name.</span>
                ) : isDuplicate(selectedLabel) ? (
                  <span className={errorStyle}>
                    Another status has this name.
                  </span>
                ) : null}
              </div>
              <div className={fieldStyle}>
                <span className={labelStyle}>Status colour</span>
                <div
                  className={css({
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "2.5",
                  })}
                >
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Colour ${color}`}
                      aria-pressed={
                        selectedLabel.displayColor.toLowerCase() === color
                      }
                      className={cx(
                        swatchButtonStyle,
                        selectedLabel.displayColor.toLowerCase() === color &&
                          swatchOnStyle,
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => updateSelected({ displayColor: color })}
                    />
                  ))}
                </div>
              </div>
              {selectedLabel.isExit ? (
                <div className={explainStyle}>
                  <b>Leaves the process</b>
                  <span>
                    A {noun} shows here after its token leaves every place on
                    this board. It also shows here when it enters a place that
                    has no status.
                  </span>
                  <span>
                    This does not mean done. A finished {noun} belongs in an
                    ordinary status, such as Done.
                  </span>
                </div>
              ) : (
                <>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>Places in this status</span>
                    {selectedLabel.places.map((placeId) => (
                      <div key={placeId} className={placeRowStyle}>
                        <span className={placeIconStyle} />
                        <span className={growStyle}>
                          {placeById.get(placeId)?.name ?? placeId}
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconName="close"
                          aria-label={`Remove ${placeById.get(placeId)?.name ?? placeId}`}
                          onClick={() => unassign(placeId)}
                        />
                      </div>
                    ))}
                    {selectedLabel.places.length === 0 && (
                      <span className={faintStyle}>
                        No places.{" "}
                        {noun.charAt(0).toUpperCase() + noun.slice(1)}s cannot
                        reach this status.
                      </span>
                    )}
                    <select
                      className={selectStyle}
                      aria-label="Add place"
                      value=""
                      onChange={(event) => {
                        if (event.target.value) {
                          movePlace(event.target.value, selectedLabel.id);
                        }
                      }}
                    >
                      <option value="">Add place…</option>
                      {places
                        .filter(
                          (place) =>
                            trackedPlaceIds.has(place.id) &&
                            !selectedLabel.places.includes(place.id),
                        )
                        .map((place) => {
                          const current = labelOf(place.id);
                          return (
                            <option key={place.id} value={place.id}>
                              {place.name}
                              {current
                                ? ` (moves from ${current.name || "Unnamed"})`
                                : " (no status yet)"}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  <div className={fieldStyle}>
                    <span className={labelStyle}>
                      Only include some {noun}s
                    </span>
                    <span className={faintStyle}>
                      {selectedLabel.tokenCondition
                        ? `Rule: ${selectedLabel.tokenCondition}. Edit rules in the Status views drawer.`
                        : "Optional rule. Not editable in this prototype."}
                    </span>
                  </div>
                  {confirmDelete ? (
                    <div className={explainStyle}>
                      <span>
                        Delete {selectedLabel.name || "this status"}?
                        {selectedLabel.places.length > 0 &&
                          " Its places move to Not on the board and need a decision."}
                      </span>
                      <div className={css({ display: "flex", gap: "2" })}>
                        <Button
                          variant="subtle"
                          tone="error"
                          size="sm"
                          onClick={deleteSelected}
                        >
                          Delete status
                        </Button>
                        <Button
                          variant="subtle"
                          tone="neutral"
                          size="sm"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Keep
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        variant="subtle"
                        tone="error"
                        size="sm"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete status
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <span className={faintStyle}>Select a status to edit it.</span>
          )}
        </aside>
      </div>
      {/* Clears the floating editor toolbar at the bottom of the canvas. */}
      <div className={toolbarClearanceStyle} aria-hidden="true" />
    </div>
  );
};
