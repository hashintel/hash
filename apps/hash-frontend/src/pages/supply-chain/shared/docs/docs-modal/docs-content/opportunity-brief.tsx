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

export const opportunityBriefSection: DocSectionDef = {
  id: "opportunity-brief",
  title: "Opportunity brief",
  entries: [
    {
      id: "opportunity-brief",
      title: "Opportunity brief",
      render: () => (
        <>
          <Lead>
            Opportunity briefs are printable investigation reports opened from
            the site opportunities table or the step detail panel, via a{" "}
            <Term>Brief</Term> button. They turn one flagged step into a
            structured evidence pack.
          </Lead>
          <P>
            There are two brief types: dwell cost reduction and planning
            parameter calibration.
          </P>

          <H4>Brief types</H4>
          <UL>
            <LI>
              <Term>Dwell cost reduction</Term> briefs focus on inventory
              carrying cost. They show current period cost, annualised cost,
              scenario savings and the operational evidence behind the wait.
            </LI>
            <LI>
              <Term>Planning calibration</Term> briefs focus on whether the
              planning parameter still matches observed timing. They compare
              current plan, P95, median, mean and the share of batches exceeding
              plan.
            </LI>
          </UL>

          <H4>Report sections</H4>
          <UL>
            <LI>
              <Term>Executive summary</Term> explains why the opportunity was
              flagged and summarises the key information.
            </LI>
            <LI>
              <Term>Opportunity diagnosis</Term> lists the main diagnostic
              statements and confidence notes for the evidence.
            </LI>
            <LI>
              <Term>Potential impact or calibration options</Term> shows
              dwell-reduction scenarios or planning service-level options.
            </LI>
            <LI>
              <Term>End-to-end leverage</Term> appears on dwell briefs when the
              step can be connected to traceable batch pipelines. It estimates
              whether reducing the wait would move finished good end-to-end
              timing.
            </LI>
            <LI>
              <Term>First-use dwell</Term> indicates how early materials were
              ordered or intermediates were produced before first downstream
              use.
            </LI>
            <LI>
              <Term>Distribution and evidence</Term> contains the box plot,
              histogram, monthly trend, statistics, evidence-quality flags and
              largest contributing records.
            </LI>
            <LI>
              <Term>Recommended next steps</Term> gives investigation checks and
              step-type-specific prompts for follow-up.
            </LI>
          </UL>

          <H4>Evidence exports and print</H4>
          <P>
            Use <Term>Evidence CSV</Term> to export the records behind the brief
            and <Term>Print / Save as PDF</Term> to share the report.
          </P>
          <Note>
            See{" "}
            <CrossRef
              to={{ section: "site-overview", sub: "overview-opportunities" }}
            >
              Opportunities
            </CrossRef>{" "}
            for how opportunities are selected.
          </Note>
        </>
      ),
    },
  ],
};
