import type {
  Color,
  Place,
  SimulationFrameReader,
  TokenRecord,
} from "@hashintel/petrinaut-core";

/** A colour keyed by `ticket_id` under the `identity-ticket` identity. */
export const ticketColor: Color = {
  id: "type-ticket",
  name: "Ticket",
  iconSlug: "circle",
  displayColor: "#0000FF",
  elements: [
    {
      elementId: "ticket-id",
      name: "ticket_id",
      type: "string",
      identityRef: "identity-ticket",
    },
  ],
};

/** A place holding `ticketColor` tokens. */
export const makeTicketPlace = (id: string, name: string): Place => ({
  id,
  name,
  colorId: ticketColor.id,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

/** A frame reader over fixed token records per place id. */
export const makeFrame = (
  number: number,
  timeSeconds: number,
  tokensByPlaceId: Record<string, TokenRecord[]>,
): SimulationFrameReader => ({
  number,
  time: timeSeconds,
  getPlaceTokenCount: (placeId) => tokensByPlaceId[placeId]?.length ?? 0,
  getPlaceTokens: (place) => tokensByPlaceId[place.id] ?? [],
  getTransitionState: () => null,
  toFrameState: () => ({ number, places: {} }),
});
