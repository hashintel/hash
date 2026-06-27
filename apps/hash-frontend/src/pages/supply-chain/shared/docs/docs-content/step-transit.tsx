import { Lead, P, H4, Term } from "../docs-primitives";

import type { DocEntry } from "../docs-types";

export const transitDoc: DocEntry = {
  id: "transit",
  title: "Transit",
  render: () => (
    <>
      <Lead>
        Transit measures how long finished product takes to move from the
        production plant to its next location on the way to the customer.
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
        the actual transport end date from transport documents. The customer
        classification comes from the delivery&apos;s ship-to account, not from
        the absence of a known hub receipt. Batches without an actual transport
        end date are not included in this step.
      </P>
    </>
  ),
};
