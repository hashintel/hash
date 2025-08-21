import type {
  PetriNetDefinitionObject,
  PlaceNodeData,
  TransitionNodeData,
} from "./types";

const escapeXml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Convert the current process to an ISO-15909-2-conformant HLPN PNML document.
 *
 * @todo the proper format is to be agreed, this current version is wrong.
 */
export const useConvertToPnml = ({
  petriNet,
  title,
}: {
  petriNet: PetriNetDefinitionObject;
  title: string;
}) => {
  const { nodes, arcs, tokenTypes } = petriNet;

  const convertToPnml = (): string => {
    /* ---------- Header & namespaces---------- */
    let pnml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml
  xmlns="http://www.pnml.org/version-2009/grammar/pnml"
  xmlns:hlpn="http://www.pnml.org/version-2009/grammar/hlpn">

  <net id="net0" type="http://www.pnml.org/version-2009/grammar/hlpn">
    <name><text>${escapeXml(title)}</text></name>`;

    /* ---------- HLPN colour-set declarations ---------- */
    pnml += `
    <hlpn:declarations>`;
    for (const tok of tokenTypes) {
      pnml += `
      <hlpn:colset id="${escapeXml(tok.id)}">
        <hlpn:list>
          <hlpn:atom>${escapeXml(tok.name)}</hlpn:atom>
        </hlpn:list>

        <!-- HASH-specific visual hint -->
        <toolspecific tool="HASH" version="1.0">
          <color>${escapeXml(tok.color)}</color>
        </toolspecific>
      </hlpn:colset>`;
    }
    pnml += `
    </hlpn:declarations>`;

    pnml += `
    <page id="page0">`;

    /* ---------- Places & initial markings ---------- */
    for (const node of nodes) {
      if (node.type !== "place") {
        continue;
      }
      const placeData = node.data as PlaceNodeData;

      pnml += `
      <place id="${escapeXml(node.id)}">
        <name><text>${escapeXml(placeData.label)}</text></name>
        <graphics><position x="${node.position.x}" y="${node.position.y}"/></graphics>
        <initialMarking>
          <hlpn:multiset>`;

      for (const [tokId, count] of Object.entries(
        placeData.initialTokenCounts ?? {},
      )) {
        if (count > 0) {
          pnml += `
            <hlpn:element multiplicity="${count}">
              <hlpn:constant>${escapeXml(tokId)}</hlpn:constant>
            </hlpn:element>`;
        }
      }

      pnml += `
          </hlpn:multiset>
        </initialMarking>
      </place>`;
    }

    /* ---------- Transitions ---------- */
    for (const node of nodes) {
      if (node.type !== "transition") {
        continue;
      }
      const transitionData = node.data as TransitionNodeData;

      pnml += `
      <transition id="${escapeXml(node.id)}">
        <name><text>${escapeXml(transitionData.label)}</text></name>
        <graphics><position x="${node.position.x}" y="${node.position.y}"/></graphics>`;

      if (
        typeof transitionData.delay === "number" ||
        transitionData.conditions?.length ||
        transitionData.description
      ) {
        pnml += `
        <toolspecific tool="HASH" version="1.0">`;

        if (transitionData.description) {
          pnml += `
            <description>${escapeXml(transitionData.description)}</description>`;
        }

        if (typeof transitionData.delay === "number") {
          pnml += `
          <timing>
            <delay unit="h">${transitionData.delay}</delay>
          </timing>`;
        }

        if (transitionData.conditions?.length) {
          pnml += `
          <routing>`;
          for (const condition of transitionData.conditions) {
            pnml += `
            <branch id="${escapeXml(condition.id)}"
                    outputArc="${escapeXml(condition.outputEdgeId)}"
                    probability="${condition.probability}">
              <name><text>${escapeXml(condition.name)}</text></name>
            </branch>`;
          }
          pnml += `
          </routing>`;
        }

        pnml += `
        </toolspecific>`;
      }

      pnml += `
      </transition>`;
    }

    /* ---------- Arcs & HLPN inscriptions ---------- */
    for (const arc of arcs) {
      pnml += `
      <arc id="${escapeXml(arc.id)}" source="${escapeXml(
        arc.source,
      )}" target="${escapeXml(arc.target)}">
        <inscription>
          <hlpn:multiset>`;

      for (const [tokId, count] of Object.entries(
        arc.data?.tokenWeights ?? {},
      )) {
        if (count) {
          pnml += `
            <hlpn:element multiplicity="${count}">
              <hlpn:constant>${escapeXml(tokId)}</hlpn:constant>
            </hlpn:element>`;
        }
      }

      pnml += `
          </hlpn:multiset>
        </inscription>
      </arc>`;
    }

    pnml += `
    </page>
  </net>
</pnml>`;

    return pnml;
  };

  return convertToPnml;
};
