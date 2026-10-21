/**
 * An interface's page: what it is, who takes part and how each participant
 * was found.
 */

import { interfaceSlug, layerSlug, relativeTo } from "../shared/page-paths";
import {
  escapeTableCell,
  frontmatter,
  sourceLink,
  type GeneratedPage,
} from "./shared/page-shape";

import type { ArchitectureModel, InterfaceNode } from "../../model";

const participantLabel = (model: ArchitectureModel, id: string): string =>
  model.externals.find((external) => external.id === id)?.name ?? id;

export const buildInterfacePage = (
  node: InterfaceNode,
  model: ArchitectureModel,
  sourceUrlPrefix: string,
  order: number,
): GeneratedPage => {
  const slug = interfaceSlug(node.id);
  const body: string[] = [];
  if (node.summary !== "") {
    body.push(node.summary, "");
  }
  body.push(
    `- Transport: \`${node.transport}\``,
    `- Defined by [${node.definedBy}](${relativeTo(slug, layerSlug(node.definedBy))}) in [\`${node.declaredIn}\`](${sourceLink(sourceUrlPrefix, node.declaredIn)})`,
    "",
    "## Participants",
    "",
    "| Participant | Role | Provenance | Evidence |",
    "| --- | --- | --- | --- |",
    ...node.participants.map((participant) => {
      const label = participant.node.startsWith("external:")
        ? participantLabel(model, participant.node)
        : `[${participant.node}](${relativeTo(slug, layerSlug(participant.node))})`;
      const evidence = participant.evidence.includes("/")
        ? `[\`${participant.evidence.split(":")[0]}\`](${sourceLink(sourceUrlPrefix, participant.evidence.split(":")[0] ?? "")})`
        : escapeTableCell(participant.evidence);
      return `| ${label} | ${participant.role} | ${participant.provenance} | ${evidence} |`;
    }),
    "",
    "A provenance of `type-ref` means the index saw the participant reference a symbol this file defines; `declared` means an annotation or the config says so and nothing in the code was checked.",
    "",
  );
  return {
    path: `pages/${slug}.mdx`,
    slug,
    title: node.name,
    description:
      node.summary === ""
        ? `Interface defined by ${node.definedBy}`
        : node.summary,
    order,
    contents:
      frontmatter({
        title: node.name,
        description:
          node.summary === ""
            ? `Interface defined by ${node.definedBy}`
            : node.summary,
        sidebar_order: order,
      }) + `\n${body.join("\n")}`,
  };
};
