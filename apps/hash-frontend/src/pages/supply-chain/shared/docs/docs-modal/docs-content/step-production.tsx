import { Lead, P, H4, Term } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const productionDoc: DocEntry = {
  id: "production",
  title: "Production",
  render: () => (
    <>
      <Lead>
        Production duration measures the per-batch cycle time: how long a batch
        takes from the point production starts on it to the point it is
        finished.
      </Lead>
      <P>
        <Term>What it measures:</Term> production start to production finish,
        per batch. The headline value is normalised to a typical batch size so
        it reads as &ldquo;days per typical batch&rdquo; rather than being
        skewed by unusually large or small campaigns.
      </P>
      <P>
        <Term>Planning comparison:</Term> production timing is compared against
        the planned in-house production time for the material, and the
        process-graph node is coloured accordingly.
      </P>

      <H4>Receipt ratio</H4>
      <P>
        Production steps expose a <Term>receipt ratio</Term> view: the quantity
        received against a production order versus the order quantity, expressed
        as a percentage with 100% as the reference. It reflects order completion
        and over-receipt rather than physical process yield.
      </P>

      <H4>Input consumption variance</H4>
      <P>
        Production steps also expose an <Term>input consumption</Term> view: the
        actual quantity of each input material consumed per order versus the
        planned quantity, as a percentage. A positive variance is
        over-consumption (more input used than planned); zero is the
        expected-consumption reference. You can view the order-level weighted
        aggregate or select a single component to see its own distribution and
        trend.
      </P>
    </>
  ),
};
