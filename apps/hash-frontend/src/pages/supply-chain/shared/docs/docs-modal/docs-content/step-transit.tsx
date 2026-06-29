import { Lead, P, H4, Term } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const transitDoc: DocEntry = {
  id: "transit",
  title: "Transit",
  render: () => (
    <>
      <Lead>
        Transit measures how long finished product takes to move from the
        production plant to its next location.
      </Lead>
      <H4>Plant to hub</H4>
      <P>
        <Term>What it measures:</Term> shipment out of the production plant to
        the first receipt at a distribution hub. One observation per batch
        arrival at the hub, anchored to the hub receipt date.
      </P>
      <H4>Direct to customer</H4>
      <P>
        For product shipped to an external customer rather than an internal
        destination, transit is measured from the goods issue shipment date to
        the actual transport end date from transport documents.
      </P>
      <P>
        Batches without an identifiable transport end date are excluded from the
        analysis.
      </P>
    </>
  ),
};
