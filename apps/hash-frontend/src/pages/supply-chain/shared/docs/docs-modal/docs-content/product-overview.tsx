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

export const productOverviewSection: DocSectionDef = {
  id: "product-overview",
  title: "Product overview",
  entries: [
    {
      id: "category-view",
      title: "Category view",
      render: () => (
        <>
          <Lead>
            The category view lays out a product&apos;s value chain as cards
            grouped by step category &mdash; procurement, dwell, production, QA
            and logistics.
          </Lead>
          <P>
            Each card shows the step&apos;s headline timing and a badge
            indicating how it compares to its planning parameter, so you can
            scan a whole product&apos;s chain at a glance. Selecting a card
            opens that step&apos;s detail.
          </P>
          <H4>Header KPIs and navigation</H4>
          <P>
            The product selector in the header switches between finished goods.
            The KPI chips below it show traceable end-to-end mean, traceable
            end-to-end median and total dwell carrying cost for the selected
            time range when those values are available. The end-to-end timings
            are the average across all destinations. For pipeline timings for
            specific destinations, see the{" "}
            <CrossRef to={{ section: "product-overview", sub: "e2e-pipeline" }}>
              end-to-end pipeline
            </CrossRef>{" "}
            view at the bottom of the screen.
          </P>
          <H4>Step categories</H4>
          <UL>
            <LI>
              <Term>Procurement</Term> measures purchase-order lead time for
              bought inputs, either to first receipt or full receipt depending
              on the procurement-basis setting (see{" "}
              <CrossRef to={{ section: "settings", sub: "procurement-basis" }}>
                Settings
              </CrossRef>
              )
            </LI>
            <LI>
              <Term>Dwell</Term> measures waiting time between operational
              milestones: raw material receipt to consumption, intermediate
              production to consumption, QA release to shipment, or hub arrival
              to onward shipment.
            </LI>
            <LI>
              <Term>Production</Term> measures manufacturing duration. Where
              available, production cards are normalised to a reference batch
              size so campaigns of different sizes are comparable.
            </LI>
            <LI>
              <Term>QA</Term> measures the hold between production finish and
              quality release.
            </LI>
            <LI>
              <Term>Logistics</Term> measures transit after release, either
              direct to the customer or to a hub destination.
            </LI>
          </UL>
          <H4>Reading a card</H4>
          <UL>
            <LI>
              <Term>Headline days</Term> are the selected measure from settings
              (median, mean, P75 or P95) for the current time range.
            </LI>
            <LI>
              <Term>Mini distribution</Term> is a compact box plot: the grey
              whiskers span min to max, the shaded box is P25 to P75, the blue
              tick is median and the yellow tick is mean.
            </LI>
            <LI>
              <Term>Planning badge</Term> shows the planning parameter in days.
              Green means the selected measure is at least 10% below plan, amber
              means between 90% and 120% of plan, and red means more than 20%
              above plan.
            </LI>
            <LI>
              <Term>Percent badge</Term> shows how far the selected measure is
              over or under the planning parameter.
            </LI>
            <LI>
              <Term>Cost badge</Term> appears on dwell cards when carrying-cost
              inputs are available. It estimates inventory carrying cost over
              the selected time range using the settings panel&apos;s WACC and
              storage assumptions.
            </LI>
            <LI>
              <Term>R and C badges</Term> appear on production cards when yield
              or consumption data is available. R is receipt ratio versus order
              quantity; C is material consumption variance versus reservation.
            </LI>
            <LI>
              <Term>Event count</Term> shows how many observations feed the
              card. A warning triangle means the sample is small.
            </LI>
          </UL>
        </>
      ),
    },
    {
      id: "canvas-view",
      title: "Canvas view",
      render: () => (
        <>
          <Lead>
            The canvas view draws the same value chain as a process graph,
            showing how materials and steps connect from inputs through to the
            finished good.
          </Lead>
          <H4>Node colour</H4>
          <P>
            Each step node is coloured by how its headline timing compares to
            the planning parameter:
          </P>
          <UL>
            <LI>
              <Term>Green</Term> &mdash; at least 10% below plan.
            </LI>
            <LI>
              <Term>Amber</Term> &mdash; between 90% and 120% of plan.
            </LI>
            <LI>
              <Term>Red</Term> &mdash; more than 20% above plan.
            </LI>
            <LI>
              <Term>Grey</Term> &mdash; no planning parameter available to
              compare against.
            </LI>
          </UL>
        </>
      ),
    },
    {
      id: "schedule-view",
      title: "Production timeline",
      render: () => (
        <>
          <Lead>
            The Timeline view shows actual production windows on one shared date
            axis, with upstream intermediate lanes ordered by BOM depth and the
            finished good highlighted last.
          </Lead>
          <P>
            Intermediate batch colour describes its recorded next use. Blue
            means the batch was only used by materials in the view. Purple means
            some or all of the batch was also used for other products. Grey
            means there is no recorded consumption.
          </P>
          <P>
            Use Range to choose the production period and the zoom controls to
            fit or inspect the timeline. Hover or focus a batch to see its
            output quantity, direct consuming materials and any quantity with no
            recorded consumption. Consumers outside the visible hierarchy are
            identified explicitly.
          </P>
        </>
      ),
    },
    {
      id: "e2e-pipeline",
      title: "End-to-end pipeline",
      render: () => (
        <>
          <Lead>
            The pipeline at the foot of the product page traces each
            finished-good batch individually, from the earliest procurement of
            any input through to the route endpoint, and decomposes the journey
            into four segments.
          </Lead>
          <P>
            Unlike the step cards (which pool statistics per step type), the
            pipeline follows real batches and computes segment durations from
            each batch&apos;s own milestone dates. The four segments are:
          </P>
          <UL>
            <LI>
              <Term>Procurement to production start</Term> covers the
              pre-production lead-in: bought inputs, raw-material availability
              and any waiting before any production starts.
            </LI>
            <LI>
              <Term>Production start to production finish</Term> covers upstream
              production chains, intermediate waits and the final finished-good
              campaign.
            </LI>
            <LI>
              <Term>Production finish to QA release</Term> is the quality hold
              after production completes.
            </LI>
            <LI>
              <Term>QA release to customer</Term> covers post-QA dwell and
              transport to the route endpoint: customer arrival for direct
              external-customer shipments; hub dispatch for routes that go via a
              hub unless a measured hub-to-customer transport end is available.
            </LI>
          </UL>
          <P>
            A route picker switches between delivery routes (direct or via a
            hub), and a coverage indicator shows how many batches had a complete
            enough trace to be included. The pipeline filters batches by the
            route endpoint date, so its population can differ from the step
            cards, which each anchor to their own event date.
          </P>
          <P>
            Shipment step cards can count more than one delivery for the same
            batch. The pipeline keeps one route per batch, so observation counts
            may be higher than the number of batches shown on the direct route.
          </P>
          <H4>Mean, median and segment toggles</H4>
          <P>
            The waterfall shows mean and median totals for the selected route.
            Segment chips in the legend can be switched off to focus the
            waterfall, KPIs and simulator on the remaining portion of the
            journey. Procurement is off by default in the view.
          </P>
        </>
      ),
    },
    {
      id: "what-if",
      title: "What-if simulator",
      render: () => (
        <>
          <Lead>
            Expanding the pipeline opens a what-if simulator: per-step cap
            controls let you ask &ldquo;if we trimmed unusually long occurrences
            of this step, how much would end-to-end time shrink, and what would
            it save?&rdquo;
          </Lead>
          <P>
            Steps on parallel procurement and production paths only help when
            they are the limiting factor, and trimming a step past the point
            where another path becomes limiting yields nothing further. Serial
            post-production steps such as QA hold, transit and destination dwell
            reduce the total directly when their long observations are capped.
          </P>
          <H4>How this works</H4>
          <P>
            Each lever caps that step&apos;s batch durations at the selected
            checkpoint: Max (no change), P95 (estimated 95th-percentile timing),
            P75, median, P25 or Exclude (count as zero time). Durations below
            the cap are unchanged; durations above it are capped at the selected
            level.
          </P>
          <P>
            For upstream production chains, the simulator recomputes the full
            set of paths for each batch and uses the longest remaining path. For
            finished-good production, QA hold and post-QA logistics, the
            simulator treats the steps as serial and subtracts the capped tail
            from the relevant segment.
          </P>
          <P>
            When you change the time range, route or outlier setting, the app
            recomputes each batch segment&apos;s mean, and median, then rebuilds
            the pipeline.
          </P>
          <P>
            The route&apos;s end-to-end mean and median use each batch&apos;s
            own total duration when that value is available. Because those
            totals are a separate per-batch distribution, they can differ
            slightly from adding together the displayed segment means or
            medians, especially when some segments are missing or outliers have
            been excluded.
          </P>
          <H4>Controls</H4>
          <UL>
            <LI>
              <Term>Cap checkpoints</Term> &mdash; each lever caps a step at a
              historical checkpoint (P95, P75, median, P25, or exclude
              entirely). The default is uncapped. A cap only clips occurrences
              above it; shorter ones are unchanged.
            </LI>
            <LI>
              <Term>Lever summary</Term> &mdash; each card shows the step&apos;s
              median and mean, the cap status, the number of observations
              shortened by an active cap and an open-step icon for drilling into
              the underlying detail panel.
            </LI>
            <LI>
              <Term>Not in current recipe</Term> &mdash; a warning badge means
              the step appears in historical traces but is not reachable in the
              current BOM or recipe, so it may not represent future production
              unless the old recipe is used again.
            </LI>
            <LI>
              <Term>Segment toggle</Term> &mdash; the legend chips below the
              waterfall switch whole segments in or out of the totals, KPIs and
              lever list. The selection is saved in the URL so it can be shared.
            </LI>
            <LI>
              <Term>Route scope</Term> &mdash; each simulation runs against one
              delivery route; the lever list reflects the steps ranked for that
              route.
            </LI>
          </UL>
          <P>
            Headline KPIs show simulated end-to-end mean and median, days saved,
            and an annualised cost saving recomputed live from the cost
            assumptions in{" "}
            <CrossRef to={{ section: "settings" }}>
              Settings &amp; controls
            </CrossRef>
            .
          </P>
          <Note>
            The simulator is a directional planning tool. It does not model
            plant capacity or business rules, only indicates what the E2E
            pipeline would be if steps could be brought down to specific levels.
          </Note>
        </>
      ),
    },
  ],
};
