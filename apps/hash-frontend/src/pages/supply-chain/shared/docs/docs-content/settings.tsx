import {
  Lead,
  P,
  H4,
  Term,
  UL,
  LI,
  Anchor,
  SettingRow,
  CrossRef,
} from "../docs-primitives";

import type { DocSectionDef } from "../docs-types";

export const settingsSection: DocSectionDef = {
  id: "settings",
  title: "Settings & controls",
  entries: [
    {
      id: "settings",
      title: "Settings & controls",
      render: () => (
        <>
          <Lead>
            These controls live behind the settings cog and apply consistently
            across the site overview, product overview and step detail. They are
            encoded in the URL, so a configured view can be shared or reloaded
            without losing its settings.
          </Lead>

          <Anchor id="wacc">
            <SettingRow name="WACC">
              The cost-of-capital rate applied to inventory value when computing
              dwell carrying cost. Raising it increases every carrying-cost
              figure proportionally.
            </SettingRow>
          </Anchor>
          <Anchor id="storage">
            <SettingRow name="Storage cost">
              The physical storage rate per tonne per day added on top of the
              cost of capital when computing dwell carrying cost.
            </SettingRow>
          </Anchor>
          <Anchor id="measure">
            <SettingRow name="Measure">
              The headline statistic used for step timing: median, mean, P75 or
              P95. It drives the step-card headline, the over/under-plan badges,
              the site planning and dwell &ldquo;observed&rdquo; columns and the
              trends. It does not change the named statistics tables in the step
              detail, which always show explicit values.
            </SettingRow>
          </Anchor>
          <Anchor id="procurement-basis">
            <SettingRow name="Procurement basis">
              Whether procurement lead time is measured to the{" "}
              <Term>first</Term> goods receipt or to the <Term>full</Term>{" "}
              (final) receipt that completes the order. See the scope note
              below.
            </SettingRow>
          </Anchor>
          <Anchor id="time-range">
            <SettingRow name="Time range">
              The 3m / 6m / 12m window. Each view filters by its own relevant
              event date, so the same window can select slightly different
              populations in different views.
            </SettingRow>
          </Anchor>
          <Anchor id="outliers">
            <SettingRow name="Exclude outliers">
              Drops values outside a Tukey 1.5x IQR fence. For each timing,
              receipt-ratio or consumption series, the app computes Q1 and Q3,
              calculates the interquartile range (IQR = Q3 - Q1), then excludes
              points below Q1 - 1.5x IQR or above Q3 + 1.5x IQR. Statistics and
              monthly timing are recomputed from the kept observations.
            </SettingRow>
          </Anchor>

          <H4>Where settings do not apply</H4>
          <UL>
            <LI>
              <Term>Procurement basis affects procurement steps only.</Term>{" "}
              First vs full receipt changes the procurement lead-time series
              wherever it appears, including the procurement rows that feed the
              site planning table and opportunities. Every non-procurement step
              type ignores it &mdash; their timings are not derived from
              purchase-order receipts, so there is nothing for the basis to
              switch between.
            </LI>
            <LI>
              <Term>Planning opportunities key off P95, not the measure.</Term>{" "}
              The planning-deviation opportunities compare the P95 of observed
              timing against the planning parameter, so they do not move when
              the headline{" "}
              <CrossRef to={{ section: "settings", sub: "measure" }}>
                measure
              </CrossRef>{" "}
              is switched between median and mean.
            </LI>
            <LI>
              <Term>Outlier fences are series-specific.</Term> Timing,
              receipt-ratio, aggregate consumption and component consumption
              each get their own IQR fence. Procurement&apos;s first-receipt and
              full-receipt timing series are also filtered independently.
            </LI>
          </UL>

          <H4>Site-only controls</H4>
          <P>
            The site overview adds two of its own controls &mdash; a category
            filter and an exclude-low-samples toggle. See{" "}
            <CrossRef to={{ section: "site-overview", sub: "site-filters" }}>
              Site filters &amp; controls
            </CrossRef>
            .
          </P>
        </>
      ),
    },
  ],
};
