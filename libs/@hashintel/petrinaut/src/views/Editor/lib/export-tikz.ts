import type { SDCPN } from "../../../core/types/sdcpn";

/**
 * The closest pair of nodes will be at least this far apart in the output,
 * giving labels room to breathe (unless net size is larger than {@link MAX_DIAGRAM_SIZE_CM} cm).
 */
const MIN_NODE_DISTANCE_CM = 2;
const MAX_DIAGRAM_SIZE_CM = 50;
const LONG_LABEL_THRESHOLD = 15;
const LONG_LABEL_TEXT_WIDTH_CM = 2.5;

const LATEX_SPECIAL_CHARS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

function escapeLatex(text: string): string {
  return text.replace(
    /[\\&%$#_{}~^]/g,
    (char) => LATEX_SPECIAL_CHARS[char] ?? char,
  );
}

function splitCamelCase(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function formatLabelAttr(name: string): string {
  const displayName = splitCamelCase(name);
  const escaped = escapeLatex(displayName);

  if (displayName.length > LONG_LABEL_THRESHOLD) {
    return `label={[text width=${LONG_LABEL_TEXT_WIDTH_CM}cm, align=center]below:{${escaped}}}`;
  }
  return `label=below:{${escaped}}`;
}

function computeScale(allNodes: { x: number; y: number }[]): {
  scale: number;
  minX: number;
  minY: number;
} {
  const xs = allNodes.map((node) => node.x);
  const ys = allNodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY) || 1;

  let minDist = Infinity;
  for (let idx = 0; idx < allNodes.length; idx++) {
    for (let jdx = idx + 1; jdx < allNodes.length; jdx++) {
      const dx = allNodes[idx]!.x - allNodes[jdx]!.x;
      const dy = allNodes[idx]!.y - allNodes[jdx]!.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < minDist) {
        minDist = dist;
      }
    }
  }

  const scaleFromMinDist =
    minDist > 0 && minDist < Infinity
      ? MIN_NODE_DISTANCE_CM / minDist
      : MAX_DIAGRAM_SIZE_CM / range;

  const scaleFromMaxSize = MAX_DIAGRAM_SIZE_CM / range;

  return { scale: Math.min(scaleFromMinDist, scaleFromMaxSize), minX, minY };
}

function generateTikZ(sdcpn: SDCPN, title: string): string {
  const allNodes = [...sdcpn.places, ...sdcpn.transitions];

  if (allNodes.length === 0) {
    return "% Empty Petri net\n";
  }

  const { scale, minX, minY } = computeScale(allNodes);

  const placeIdMap = new Map<string, string>();
  for (const [i, place] of sdcpn.places.entries()) {
    placeIdMap.set(place.id, `p${i}`);
  }

  const transitionIdMap = new Map<string, string>();
  for (const [i, transition] of sdcpn.transitions.entries()) {
    transitionIdMap.set(transition.id, `t${i}`);
  }

  function toTikzCoord(x: number, y: number): string {
    const tx = ((x - minX) * scale).toFixed(2);
    const ty = (-(y - minY) * scale).toFixed(2);
    return `(${tx}, ${ty})`;
  }

  const lines: string[] = [];

  lines.push("\\documentclass[border=10pt]{standalone}");
  lines.push("\\usepackage{tikz}");
  lines.push("\\usetikzlibrary{arrows.meta}");
  lines.push("");
  lines.push("\\begin{document}");
  lines.push(`% ${escapeLatex(title)}`);
  lines.push("\\begin{tikzpicture}[");
  lines.push("  place/.style={circle, draw, thick, minimum size=8mm},");
  lines.push(
    "  transition/.style={rectangle, draw, thick, fill=black!75, minimum width=2mm, minimum height=8mm},",
  );
  lines.push("  arc/.style={-{Stealth[length=3mm]}, thick},");
  lines.push("  every label/.style={font=\\small},");
  lines.push("]");
  lines.push("");

  if (sdcpn.places.length > 0) {
    lines.push("  % Places");
    for (const place of sdcpn.places) {
      const tikzId = placeIdMap.get(place.id)!;
      const coord = toTikzCoord(place.x, place.y);
      const labelAttr = formatLabelAttr(place.name);
      lines.push(`  \\node[place, ${labelAttr}] (${tikzId}) at ${coord} {};`);
    }
    lines.push("");
  }

  if (sdcpn.transitions.length > 0) {
    lines.push("  % Transitions");
    for (const transition of sdcpn.transitions) {
      const tikzId = transitionIdMap.get(transition.id)!;
      const coord = toTikzCoord(transition.x, transition.y);
      const labelAttr = formatLabelAttr(transition.name);
      lines.push(
        `  \\node[transition, ${labelAttr}] (${tikzId}) at ${coord} {};`,
      );
    }
    lines.push("");
  }

  const arcLines: string[] = [];
  for (const transition of sdcpn.transitions) {
    const tId = transitionIdMap.get(transition.id)!;

    for (const arc of transition.inputArcs) {
      const pId = placeIdMap.get(arc.placeId);
      if (!pId) {
        continue;
      }
      const weightLabel =
        arc.weight !== 1
          ? ` node[midway, auto, font=\\footnotesize] {${arc.weight}}`
          : "";
      arcLines.push(`  \\draw[arc] (${pId}) --${weightLabel} (${tId});`);
    }

    for (const arc of transition.outputArcs) {
      const pId = placeIdMap.get(arc.placeId);
      if (!pId) {
        continue;
      }
      const weightLabel =
        arc.weight !== 1
          ? ` node[midway, auto, font=\\footnotesize] {${arc.weight}}`
          : "";
      arcLines.push(`  \\draw[arc] (${tId}) --${weightLabel} (${pId});`);
    }
  }

  if (arcLines.length > 0) {
    lines.push("  % Arcs");
    lines.push(...arcLines);
    lines.push("");
  }

  lines.push("\\end{tikzpicture}");
  lines.push("\\end{document}");
  lines.push("");

  return lines.join("\n");
}

/**
 * Exports the Petri net structure as a standalone TikZ/LaTeX document.
 *
 * Renders places as circles, transitions as filled bars, and arcs as
 * directed edges. Arc weights are labelled when not equal to 1.
 * Visual x/y positions are preserved (scaled to fit ~{@link MAX_DIAGRAM_SIZE_CM} cm).
 */
export function exportTikZ({
  petriNetDefinition,
  title,
}: {
  petriNetDefinition: SDCPN;
  title: string;
}): void {
  const tikzSource = generateTikZ(petriNetDefinition, title);

  const blob = new Blob([tikzSource], { type: "application/x-tex" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  link.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${new Date().toISOString().replace(/:/g, "-")}.tex`;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
