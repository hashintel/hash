import { Lead, P, Term } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const qaDoc: DocEntry = {
  id: "qa",
  title: "QA hold / release",
  render: () => (
    <>
      <Lead>
        QA hold measures the quality inspection and hold period between
        production completion and QA release.
      </Lead>
      <P>
        <Term>Composite-tested materials:</Term> one observation per production
        campaign, measured from the final batch receipt in that campaign to its
        QA release. The full 'data' table retains each batch as supporting
        evidence.
      </P>
      <P>
        <Term>Other materials:</Term> one observation per finished-good batch,
        measured from that batch's production receipt to its QA release.
      </P>
      <P>
        <Term>Time filtering:</Term> both observation series are anchored to the
        QA release date.
      </P>
      <P>
        The wait that follows QA release &mdash; from release to dispatch
        &mdash; is measured separately as post-QA dwell.
      </P>
    </>
  ),
};
