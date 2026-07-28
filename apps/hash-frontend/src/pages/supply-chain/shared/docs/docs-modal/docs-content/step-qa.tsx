import { Lead, P, Term } from "../../docs-primitives";

import type { DocEntry } from "../../docs-types";

export const qaDoc: DocEntry = {
  id: "qa",
  title: "QA hold / release",
  render: () => (
    <>
      <Lead>
        QA hold measures the time a production campaign waits between production
        completion and QA release &mdash; the quality inspection and hold
        period.
      </Lead>
      <P>
        <Term>What it measures:</Term> the time between a production campaign
        finishing and the associated QA release. The full 'data' table also
        shows the time between each batch's production finish and QA release.
      </P>
      <P>
        <Term>Time filtering:</Term> observations are anchored to the campaign
        end date.
      </P>
      <P>
        The wait that follows QA release &mdash; from release to dispatch
        &mdash; is measured separately as post-QA dwell.
      </P>
    </>
  ),
};
