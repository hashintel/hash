import { Lead, P, H4, Term, Note, CrossRef } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const procurementDoc: DocEntry = {
  id: "procurement",
  title: "Procurement",
  render: () => (
    <>
      <Lead>
        Procurement measures how long a purchased input takes to arrive: the
        elapsed time from purchase-order creation to the selected receipt
        milestone, either first goods receipt or full receipt.
      </Lead>
      <P>
        <Term>What it measures:</Term> purchase order creation to the active
        procurement basis. First receipt captures when stock first lands; full
        receipt captures when the order is complete. Every order contributes one
        lead-time observation for the selected basis, so a material ordered many
        times produces many observations.
      </P>
      <P>
        <Term>Time filtering:</Term> observations are anchored to the receipt
        date for the active basis, so the 3m / 6m / 12m window selects receipts
        that landed inside that period.
      </P>
      <H4>Planning comparison</H4>
      <P>
        Procurement timing is compared against the planned delivery time held
        for the material. On the process graph the step node is coloured by how
        the headline value compares to that plan, and the site planning table
        ranks materials by how far observed timing deviates from it.
      </P>
      <H4>Supplier dimension</H4>
      <P>
        Where supplier performance is enabled, procurement steps expose an
        additional view that isolates <Term>supplier execution</Term>: how
        reliably the vendor delivers against the date they promised, reported as
        on-time rate and OTIF (on-time in-full). Two delay figures are shown per
        vendor: expected delay across all deliveries, and severity conditional
        on the late deliveries only.
      </P>
      <Note>
        The headline procurement lead time and the supplier view answer
        different questions. Lead time spans planner buffer plus supplier
        execution; the supplier view strips out the buffer and looks only at
        delivery against the promised date. See{" "}
        <CrossRef to={{ section: "settings", sub: "procurement-basis" }}>
          procurement basis
        </CrossRef>{" "}
        for how first vs full receipt changes the headline.
      </Note>
    </>
  ),
};
