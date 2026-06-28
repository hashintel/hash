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
            Steps shared across goods (such as a raw material or intermediate
            used by several goods) appear once, tagged with every good that uses
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
              when P95 is at least 10% above or below plan. To see comparisons
              against other statistics (e.g. median), use the{" "}
              <CrossRef to={{ section: "site-overview", sub: "planning-tab" }}>
                {" "}
                Planning parameters tab
              </CrossRef>{" "}
              further down the page.
            </LI>
          </UL>
          <P>
            Each row shows its impact, supporting evidence and a sample-size
            confidence label. Selecting a row opens that step&apos;s detail; the
            row actions include <Term>Brief</Term>, <Term>Mark read</Term>,{" "}
            <Term>Mark unread</Term> and the investigation status action.
          </P>
          <H4>Investigation workflow</H4>
          <UL>
            <LI>
              <Term>Mark read</Term> hides an opportunity from the default list
              once it has been reviewed. <Term>Mark unread</Term> returns it to
              the unread list.
            </LI>
            <LI>
              <Term>Show read</Term> brings reviewed opportunities back into the
              table.
            </LI>
            <LI>
              Record any actions for the opportunity using the status action
              button. It is labelled by the latest saved state:{" "}
              <Term>To action</Term>, <Term>Investigating</Term>,{" "}
              <Term>Investigated</Term> or <Term>Rejected</Term>. It records an
              investigation start, update, conclusion, infeasible rejection or
              data-issue rejection.
            </LI>
            <LI>
              Status updates are keyed to the step/opportunity target, visible
              again from the step detail panel, and viewable by anyone with
              access to the supply-chain data web. Read/unread markers are a
              personal preference.
            </LI>
          </UL>
          <P>
            The <Term>Brief</Term> action opens a printable{" "}
            <CrossRef to={{ section: "opportunity-brief" }}>
              Opportunity brief
            </CrossRef>{" "}
            with the evidence, scenarios and recommended checks behind the row.
          </P>
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
          <P>
            Dwell rows remain visible even when Exclude low samples is on,
            because a small number of high-value waits can still explain real
            carrying cost. Low-sample dwell rows are labelled so the statistic
            is treated as directional.
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
            steps running over plan and steps comfortably under it &mdash; by
            comparing the selected measure from{" "}
            <CrossRef to={{ section: "settings", sub: "measure" }}>
              Settings &amp; controls
            </CrossRef>{" "}
            with the planning parameter. Use it to find candidates for planning
            recalibration.
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
            The Trend tab lists steps whose selected timing measure is moving up
            or down versus the previous comparison period.
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
              <Term>Exclude low samples</Term> &mdash; hide Planning and Trend
              rows with fewer than 10 observations, so rankings are not
              dominated by noisy single-event steps. Dwell rows stay visible and
              are labelled instead because carrying cost can still be material.
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
