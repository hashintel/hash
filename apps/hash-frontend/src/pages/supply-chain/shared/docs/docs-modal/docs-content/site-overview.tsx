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

import type { DocSectionDef } from "../../docs-types";

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
            dashboard, so the highest-impact planning and cost issues surface
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
              5,000 in the local currency.
            </LI>
            <LI>
              <Term>Planning over / under</Term> &mdash; observed timing sitting
              above or below the planning parameter for the step. It appears
              when estimated 95th-percentile timing is at least 10% above or
              below plan. To see comparisons against other statistics (e.g.
              median), use the{" "}
              <CrossRef to={{ section: "site-overview", sub: "planning-tab" }}>
                {" "}
                Planning parameters tab
              </CrossRef>{" "}
              further down the page.
            </LI>
          </UL>
          <P>
            Each row shows its impact, supporting evidence and a sample-size
            confidence label, and ends with the investigation status action.
            Clicking a row opens that step&apos;s detail, where the full
            evidence and printable brief are available.
          </P>
          <P>
            Sort and filter the table from its column headers: <Term>Type</Term>{" "}
            filters by opportunity kind (hiding a kind removes its whole
            section), <Term>Opportunity</Term> sorts by title and filters by
            product, and <Term>Status</Term> sorts and filters by the
            investigation state.
          </P>
          <H4>Investigation workflow</H4>
          <UL>
            <LI>
              Record any actions for the opportunity using the status action
              button. It is labelled by the latest saved state:{" "}
              <Term>To action</Term>, <Term>Investigating</Term>,{" "}
              <Term>Investigated</Term> or <Term>Rejected</Term>. It records an
              investigation start, update, conclusion, infeasible rejection or
              data-issue rejection.
            </LI>
            <LI>
              All status updates for a given step are visible from the step
              detail panel, and viewable by anyone with access to the
              organisation.
            </LI>
          </UL>
          <P>
            Opening a row&apos;s step detail gives access to the printable{" "}
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
            It depends on the configured cost of capital and storage rates. See{" "}
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
            carrying cost. Low-sample dwell rows are labelled.
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
          <P>
            You can change the statistic to compare the parameter with in the
            user{" "}
            <CrossRef to={{ section: "settings", sub: "measure" }}>
              Settings
            </CrossRef>{" "}
            menu.
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
            The Trend tab lists steps whose selected measure is moving up or
            down versus the previous comparison period (e.g. if 12 months is
            selected from the user settings, it compares the last 12 months with
            the previous 12 months)
          </Lead>
          <P>
            Use it as a directional signal beside the dwell and planning tabs:
            worsening rows can point to emerging delays, while improving rows
            can indicate improvements.
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
            Every table is sortable and filterable from its column headers,
            alongside one site-wide control.
          </Lead>
          <UL>
            <LI>
              <Term>Column sort</Term> &mdash; click a sortable column header to
              sort by it, and click again to reverse the direction.
            </LI>
            <LI>
              <Term>Column filters</Term> &mdash; the funnel on a column header
              opens a searchable menu to include or exclude values. On the
              detail tables the <Term>Step</Term> column filters by step type
              (the available types depend on the active tab) and the{" "}
              <Term>Status</Term> column filters by investigation state. Use{" "}
              <Term>Only</Term> to isolate a single value, or <Term>Reset</Term>{" "}
              to re-select everything.
            </LI>
            <LI>
              <Term>Exclude low samples</Term> &mdash; hide Planning and Trend
              rows with fewer than 10 observations, so rankings are not
              dominated by noisy single-event steps.
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
