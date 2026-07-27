import { Lead, P, H4, Term, UL, LI, CrossRef } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const stepDetailDoc: DocEntry = {
  id: "step-detail",
  title: "Step detail panel",
  render: () => (
    <>
      <Lead>
        The step detail panel provides a quick view of evidence for a single
        step. It shows the step&apos;s duration distribution, monthly trend,
        planning comparison and source records.
      </Lead>
      <H4>Dimensions</H4>
      <UL>
        <LI>
          <Term>Receipt ratio</Term> appears on production steps when
          receipt/yield data is available. It compares received quantity with
          the order quantity.
        </LI>
        <LI>
          <Term>Consumption</Term> appears when component consumption is
          available. It compares actual consumption with material reservations.
          It shows aggregate variance and lets you inspect component-level
          consumption against expectation.
        </LI>
      </UL>

      <H4>Charts and statistics</H4>
      <UL>
        <LI>
          <Term>Statistics</Term> list the named measures directly: min, mean,
          median, P75, P85, P95, max and sample count.
        </LI>
        <LI>
          <Term>Distribution</Term> shows the spread of observations for the
          active time range and dimension. Use it to distinguish one-off tails
          from broad shifts in the whole series. On dwell steps, switch between
          duration and event value using the standard dwell-cost calculation
          (kg-days with WACC and storage-cost assumptions).
        </LI>
        <LI>
          <Term>Monthly trend</Term> shows change over time. Selecting a month
          filters the evidence table to the records behind that point.
        </LI>
        <LI>
          <Term>Planning comparison</Term> shows the planning parameter, the
          difference from observed timing and the source note where the plan is
          not the default planned-delivery-time field.
        </LI>
      </UL>

      <H4>Evidence and actions</H4>
      <UL>
        <LI>
          <Term>Brief</Term> opens a printable opportunity brief when the step
          is part of a site opportunity. The brief turns the evidence into an
          investigation narrative.
        </LI>
        <LI>
          The status action button is labelled <Term>To action</Term>,{" "}
          <Term>Investigating</Term>, <Term>Investigated</Term> or{" "}
          <Term>Rejected</Term> based on the latest saved update. It lets you
          record investigation progress, updates, conclusions or rejections.
          Status history is tied to the step/opportunity, reappears when the
          same target is opened again, and is viewable by anyone with access to
          the supply-chain data web.
        </LI>
        <LI>
          Use <Term>Data</Term> to open a table with the underlying records used
          to compute analysis. It can be exported with <Term>Export CSV</Term>{" "}
          for follow-up checks in another system.
        </LI>
        <LI>
          <Term>Time range</Term> buttons (3m, 6m, 12) filter the panel.
        </LI>
        <LI>
          <Term>Outlier count</Term> appears in the header when the Exclude
          outliers setting removes timing observations from the current step.
          See{" "}
          <CrossRef to={{ section: "settings", sub: "outliers" }}>
            Exclude outliers
          </CrossRef>
          .
        </LI>
      </UL>

      <H4>Cost drill-down</H4>
      <P>
        Dwell steps with material cost data include a savings calculator that
        estimates carrying-cost impact from reducing dwell days
      </P>
    </>
  ),
};
