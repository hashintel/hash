import { Lead, P, H4, Term, UL, LI, Note, CrossRef } from "../docs-primitives";

import type { DocSectionDef } from "../docs-types";

export const siteOverviewSection: DocSectionDef = {
  id: "site-overview",
  title: "Site overview",
  entries: [
    {
      id: "overview-opportunities",
      title: "Overview & opportunities",
      render: () => (
        <>
          <Lead>
            The site view brings every product made at the plant into one
            dashboard, so the highest-impact timing and cost issues surface
            regardless of which product they belong to.
          </Lead>
          <P>
            Steps shared across products (such as a raw material used by several
            finished goods) appear once, tagged with every product that uses
            them, so their cost is not double-counted. Product-specific steps
            stay attributed to their product.
          </P>
          <H4>Opportunities</H4>
          <P>
            The opportunities table at the top ranks the most actionable
            findings across the site. Each opportunity is one of:
          </P>
          <UL>
            <LI>
              <Term>Dwell cost</Term> &mdash; a dwell step carrying a material
              cost over the selected period. It appears when median dwell is at
              least 7 days and the selected-period carrying cost is at least
              5,000 in the site currency.
            </LI>
            <LI>
              <Term>Planning over / under</Term> &mdash; observed timing sitting
              above or below the planning parameter for the step. It appears
              when P95 is at least 10% above or below plan.
            </LI>
          </UL>
          <P>
            Each row shows its impact, supporting evidence and a sample-size
            confidence label, and can be marked read or unread and annotated
            with status updates to track investigation status. Selecting a row
            opens that step&apos;s detail.
          </P>
          <H4>Investigation workflow</H4>
          <P>
            Mark read hides an opportunity from the default list once it has
            been reviewed; Show read brings completed items back. The Status
            action records investigation started, updates, conclusions,
            infeasible rejections or data-issue rejections. Status history is
            keyed to the step/opportunity target and is also visible from the
            step detail panel.
          </P>
          <P>
            The Brief action opens a printable{" "}
            <CrossRef to={{ section: "opportunity-brief" }}>
              Opportunity brief
            </CrossRef>{" "}
            with the evidence, scenarios and recommended checks behind the row.
          </P>
          <Note>
            Dwell opportunity qualification uses median dwell and carrying cost;
            planning opportunity qualification uses P95. These are fixed gates,
            so changing the global Measure setting does not change which
            opportunities appear.
          </Note>
        </>
      ),
    },
    {
      id: "monthly-carry-cost",
      title: "Monthly carry-cost chart",
      render: () => (
        <>
          <Lead>
            The monthly carrying-cost chart shows total inventory carrying cost
            per calendar month, summed across every dwell step at the site.
          </Lead>
          <P>
            It makes the seasonal shape of the carrying burden visible and is
            recomputed live as the cost assumptions change. See{" "}
            <CrossRef to={{ section: "settings", sub: "wacc" }}>WACC</CrossRef>{" "}
            and{" "}
            <CrossRef to={{ section: "settings", sub: "storage" }}>
              storage cost
            </CrossRef>
            .
          </P>
        </>
      ),
    },
    {
      id: "dwell-tab",
      title: "Dwell time / cost tab",
      render: () => (
        <>
          <Lead>
            The dwell tab ranks every dwell step at the site by its inventory
            carrying cost over the selected period.
          </Lead>
          <P>
            Each row shows the observed dwell time and the period cost; sorting
            surfaces the most expensive waits first. Rows open the step detail
            for the full distribution and cost breakdown.
          </P>
        </>
      ),
    },
    {
      id: "planning-tab",
      title: "Planning parameters tab",
      render: () => (
        <>
          <Lead>
            The planning tab ranks steps by how far observed timing deviates
            from the planning parameter held for the step.
          </Lead>
          <P>
            It surfaces where the plan and reality diverge most &mdash; both
            steps running over plan and steps comfortably under it &mdash; as
            candidates for planning recalibration.
          </P>
        </>
      ),
    },
    {
      id: "trend-tab",
      title: "Trend tab",
      render: () => (
        <>
          <Lead>
            The Trend tab lists steps whose median lead time is moving up or
            down versus the previous comparison period.
          </Lead>
          <P>
            Use it as a directional signal beside the dwell and planning tabs:
            worsening rows can point to emerging delays, while improving rows
            can confirm that recent changes are reducing observed timing.
          </P>
        </>
      ),
    },
    {
      id: "supplier-tab",
      title: "Supplier performance tab",
      supplierFlagGated: true,
      render: () => (
        <>
          <Lead>
            The supplier tab is a leaderboard of vendors, pooling every delivery
            a vendor made into the plant across all materials in scope.
          </Lead>
          <P>
            Vendors are scored on on-time delivery against their promised dates
            and on delivery delay. Both an expected delay across all deliveries
            and the severity conditional on late deliveries are shown, so a
            mostly-reliable vendor with occasional severe misses is not hidden
            by an on-time majority. Vendors with very few measured deliveries
            are held back to keep the rankings stable.
          </P>
          <P>
            Selecting a vendor opens a drill-down with that vendor&apos;s OTIF
            trend and worst late deliveries. Procurement step details can also
            show supplier performance for the selected material, while the site
            tab pools deliveries across all materials in scope.
          </P>
          <Note>
            This view is only present when supplier performance is enabled.
          </Note>
        </>
      ),
    },
    {
      id: "site-filters",
      title: "Site filters & controls",
      render: () => (
        <>
          <Lead>
            Two controls are specific to the site view and sit alongside the
            lower detail tables or shared analysis settings.
          </Lead>
          <UL>
            <LI>
              <Term>Category filter</Term> &mdash; shown on the Planning
              parameters and Trend tabs to restrict those tables to chosen step
              categories. It is hidden on the Dwell tab, and the Dwell category
              is omitted from the Planning parameters filter.
            </LI>
            <LI>
              <Term>Exclude low samples</Term> &mdash; hide steps with fewer
              than 10 observations, so rankings are not dominated by noisy
              single-event steps.
            </LI>
          </UL>
          <P>
            All other controls are shared across views &mdash; see{" "}
            <CrossRef to={{ section: "settings" }}>
              Settings &amp; controls
            </CrossRef>
            .
          </P>
        </>
      ),
    },
  ],
};
