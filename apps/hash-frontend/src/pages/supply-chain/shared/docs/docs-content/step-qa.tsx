import { Lead, P, Term } from "../docs-primitives";

import type { DocEntry } from "../docs-types";

export const qaDoc: DocEntry = {
  id: "qa",
  title: "QA hold / release",
  render: () => (
    <>
      <Lead>
        QA hold measures the time a finished batch waits between production
        completion and QA release &mdash; the quality inspection and hold
        period.
      </Lead>
      <P>
        <Term>What it measures:</Term> production receipt (the batch is complete
        and received into inventory) to QA release (the batch passes inspection
        and is cleared for use). One observation per finished-good batch.
      </P>
      <P>
        <Term>Time filtering:</Term> observations are anchored to the
        production-receipt date, so the selected window picks batches that
        completed production inside that period.
      </P>
      <P>
        The wait that follows QA release &mdash; from release to dispatch
        &mdash; is measured separately as post-QA dwell.
      </P>
    </>
  ),
};
