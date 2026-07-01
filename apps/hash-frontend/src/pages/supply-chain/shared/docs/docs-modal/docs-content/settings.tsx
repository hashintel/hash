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
} from "../../docs-primitives";

import type { DocSectionDef } from "../../docs-types";

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
              (final) receipt that completes the order.
            </SettingRow>
          </Anchor>
          <Anchor id="time-range">
            <SettingRow name="Time range">
              What time period to include in the analysis. Averages will be
              shown across the period, and trends will be shown comparing the
              current period with the previous period. For example, if 12 months
              is selected, averages shown will be across the last 12 months, and
              trends will compare the last 12 months with the previous 12
              months.
            </SettingRow>
          </Anchor>
          <Anchor id="outliers">
            <SettingRow name="Exclude outliers">
              Excludes values falling significantly outside the normal
              distribution. This is done by computing the interquartile range
              (IQR), i.e. the values falling between 25% and 75% of
              observations, and then excluding any values which are greater than
              1.5x IQR above the third quartile or less than 1.5x IQR below the
              first quartile (aka Tukey fences).
            </SettingRow>
          </Anchor>

          <H4>Where settings do not apply</H4>
          <UL>
            <LI>
              <Term>Procurement basis affects procurement steps only.</Term>{" "}
              First vs full receipt changes the procurement lead-time analysis
              wherever it appears.
            </LI>
            <LI>
              <Term>Planning opportunities</Term> in the site overview are
              selected by parameters which are more than 10% above or below
              estimated 95th-percentile timing, not the selected measure. The
              full planning parameter tab lower down on the site overview are
              affected by the selected measure.
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
