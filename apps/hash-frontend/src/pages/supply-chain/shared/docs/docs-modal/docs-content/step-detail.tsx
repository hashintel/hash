import {
  Lead,
  P,
  H4,
  Term,
  UL,
  LI,
  Note,
  CrossRef,
} from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const stepDetailDoc: DocEntry = {
  id: "step-detail",
  title: "Step detail panel",
  render: () => (
    <>
      <Lead>
        The step detail panel is the main place to investigate a single
        value-chain step after selecting a product card, canvas node, site table
        row or opportunity.
      </Lead>
      <P>
        It keeps the step&apos;s method explanation close by through the
        <Term>About this step</Term> button, but the panel itself is about
        evidence: distributions, trends, records, status and related operational
        dimensions.
      </P>

      <H4>Dimensions</H4>
      <UL>
        <LI>
          <Term>Timing</Term> is the default view. It shows the step&apos;s
          duration distribution, monthly trend, planning comparison and source
          records.
        </LI>
        <LI>
          <Term>Receipt ratio</Term> appears on production steps when
          receipt/yield data is available. It compares received quantity with
          the order quantity.
        </LI>
        <LI>
          <Term>Consumption</Term> appears when component consumption is
          available. It shows aggregate variance and lets you inspect
          component-level consumption against expectation.
        </LI>
        <LI>
          <Term>Supplier</Term> appears on procurement steps when supplier
          performance is enabled. It separates vendor execution against promised
          dates from procurement lead time.
        </LI>
      </UL>

      <H4>Charts and statistics</H4>
      <UL>
        <LI>
          <Term>Statistics</Term> list the named measures directly: min, mean,
          median, P75, P85, P95, max and sample count. These values stay
          explicit even when the global Measure setting changes the headline
          value elsewhere.
        </LI>
        <LI>
          <Term>Distribution</Term> shows the spread of observations for the
          active time range and dimension. Use it to distinguish one-off tails
          from broad shifts in the whole series.
        </LI>
        <LI>
          <Term>Monthly trend</Term> shows how timing, cost, receipt ratio or
          consumption has moved over time. Selecting a month filters the
          evidence table to the records behind that point.
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
          <Term>Source records</Term> open from the table button in the header.
          Use <Term>Data</Term> to open the table. It can be filtered by the
          active month and exported with <Term>Export CSV</Term> for follow-up
          checks in another system.
        </LI>
        <LI>
          <Term>Time range</Term> buttons filter the panel independently while
          keeping it consistent with the same 3m / 6m / 12m windows used
          elsewhere.
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
      </UL>

      <H4>Cost and supplier drill-down</H4>
      <P>
        Dwell steps with material cost data include a savings calculator that
        estimates carrying-cost impact from reducing dwell days. Procurement
        supplier views can drill from a vendor row into a vendor detail panel
        with on-time trend and late-delivery examples.
      </P>
      <Note>
        Step detail evidence is still filtered by the selected product or site
        context. A shared site step may show multiple products in the header;
        use those links to jump to the product-specific view of the same step.
      </Note>
    </>
  ),
};
