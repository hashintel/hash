import {
  Lead,
  P,
  H4,
  Term,
  SpanList,
  SpanItem,
  CrossRef,
} from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const dwellDoc: DocEntry = {
  id: "dwell",
  title: "Dwell",
  render: () => (
    <>
      <Lead>
        Dwell measures how long material waits in inventory between two events.
        There are four dwell points across the value chain, each measuring a
        different wait.
      </Lead>
      <P>
        <Term>One observation per event.</Term> Dwell is measured at every
        individual consumption or movement event, not as a single average per
        batch. A batch drawn from stock across three production orders produces
        three observations, each dated at its actual draw and quantity.
      </P>

      <H4>The four dwell spans</H4>
      <SpanList>
        <SpanItem
          id="dwell-raw-material"
          name="Raw material dwell"
          from="Receipt"
          to="Consumption"
        >
          How long a purchased input waits in stock after receipt before it is
          consumed into production.
        </SpanItem>
        <SpanItem
          id="dwell-intermediate"
          name="Intermediate dwell"
          from="Production receipt"
          to="Consumption"
        >
          How long an in-house intermediate waits after it is produced before
          the next production stage consumes it.
        </SpanItem>
        <SpanItem
          id="dwell-post-qa-ship"
          name="Post-QA to ship dwell"
          from="QA release"
          to="Goods issue"
        >
          How long finished product waits after QA release before it is issued
          for shipment.
        </SpanItem>
        <SpanItem
          id="dwell-destination"
          name="Destination dwell"
          from="Hub inbound"
          to="First outbound"
        >
          How long finished product sits at a distribution hub after arrival
          before its first onward dispatch.
        </SpanItem>
      </SpanList>

      <H4>Carrying cost</H4>
      <P>
        Every dwell point carries an inventory carrying-cost view: the quantity
        in stock multiplied by the days it is held, costed with a
        cost-of-capital rate and a physical storage rate. The cost is built from
        a daily balance so material consumed early in a month is not charged for
        the rest of it. Both rates are adjustable &mdash; see{" "}
        <CrossRef to={{ section: "settings", sub: "wacc" }}>WACC</CrossRef> and{" "}
        <CrossRef to={{ section: "settings", sub: "storage" }}>
          storage cost
        </CrossRef>
        .
      </P>
    </>
  ),
};
