/**
 * @layerRoot ui.dev
 * @role Tools only stories and benchmarks use: a net tiled to a chosen size, and the token encoding playground
 */

import type { SDCPN } from "@hashintel/petrinaut-core";

/** The gap between two copies, in canvas units. */
const gap = 400;

/**
 * `copies` copies of a net laid out in a grid as one net, for measuring the
 * editor on nets larger than the examples. Places and transitions are copied
 * with their arcs. Types, equations, parameters and scenarios are shared, and
 * the scenarios keep referring to the first copy.
 */
export const tileNet = (net: SDCPN, copies: number, columns = 3): SDCPN => {
  if (copies <= 1) {
    return net;
  }
  const nodes = [...net.places, ...net.transitions];
  const span = (values: number[]) =>
    Math.max(...values) - Math.min(...values) + gap;
  const width = span(nodes.map((node) => node.x));
  const height = span(nodes.map((node) => node.y));
  const idIn = (copy: number, id: string) =>
    copy === 0 ? id : `${id}__copy_${copy}`;

  const places: SDCPN["places"] = [];
  const transitions: SDCPN["transitions"] = [];
  for (let copy = 0; copy < copies; copy++) {
    const offset = {
      x: (copy % columns) * width,
      y: Math.floor(copy / columns) * height,
    };
    // An input arc is an output arc with a type, so this bound takes both.
    const arcIn = <
      Arc extends SDCPN["transitions"][number]["outputArcs"][number],
    >(
      arc: Arc,
    ): Arc => ({
      ...arc,
      ...(arc.placeId === undefined
        ? {}
        : { placeId: idIn(copy, arc.placeId) }),
      ...(arc.endpoint?.kind === "place"
        ? {
            endpoint: {
              ...arc.endpoint,
              placeId: idIn(copy, arc.endpoint.placeId),
            },
          }
        : {}),
    });
    for (const place of net.places) {
      places.push({
        ...place,
        id: idIn(copy, place.id),
        x: place.x + offset.x,
        y: place.y + offset.y,
      });
    }
    for (const transition of net.transitions) {
      transitions.push({
        ...transition,
        id: idIn(copy, transition.id),
        x: transition.x + offset.x,
        y: transition.y + offset.y,
        inputArcs: transition.inputArcs.map(arcIn),
        outputArcs: transition.outputArcs.map(arcIn),
      });
    }
  }

  return { ...net, places, transitions };
};
