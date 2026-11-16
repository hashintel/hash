# Pipeline with an Iceberg sync ledger

## Start here

**Handoff: 16 November 2026. Next session: detailed stage planning and issue drafting, starting with Capture.**

We are re-architecting the existing ingestion pipeline to make its responsibilities, persisted state and recovery easier to reason about. The direction is **Capture → Prepare → Send & record**, with reusable captured input in S3, an Iceberg entity-change ledger, and S3 records for run and delivery progress. Reuse the previous implementation's conversions, helpers and regression coverage where their semantics fit.

The high-level architecture and diagram are ready for alignment. The new design is **not implementation-ready yet**: exact payloads, APIs, recovery protocols and acceptance checks still need to be specified. This planning pass has changed documentation and the diagram, not the production pipeline; the new architecture has not been verified end to end. No issues have been created as part of this pass.

Keep the high-level plan in one file; add detail to separate stage plans as we work through them. The diagram is deliberately a compact overview with hover explanations, not a full specification.

## Reading order

- [Stage and step breakdown](03-step-contracts.md): a concise overview of stages, steps and S3/Iceberg storage, followed by the shared contracts and review scopes. Deeper planning happens separately for each stage.
- [Stage 1 planning](stage-1-capture.md): generic capture of full dumps, incremental updates and future input types, with a shared publication contract.
- [Pipeline overview](index.html): three colored stages, five steps and S3 storage, with short hover explanations. Includes all styles and scripts in one file.

The [previous pipeline specs](../pipeline/00-overview.md) remain separate reference material.

## Pick up the work

1. Read the breakdown's **Goal and design boundaries**, **Open decisions** and **Turning steps into issues** sections.
2. Continue [Stage 1 planning](stage-1-capture.md), beginning with the shared capture manifest and the distinct semantics of full snapshots and partial updates.
3. Agree the first CLI input/connector scope without narrowing Capture to that one input type. Then draft the Capture parent issue and any cohesive sub-issues, with concrete contracts and acceptance cases.
4. Plan Prepare and Send in turn. Keep cross-stage decisions in the breakdown and link stage issues to their dependencies rather than silently assuming answers.

Do not restart the previous four-stage implementation workflow or begin the new implementation merely because the high-level diagram is complete. Implementation begins after the relevant contracts and issue scope are agreed. Restate is out of scope; RabbitMQ is a later orchestration direction, with ownership and retry mechanics still unresolved. No push, publication or merge is authorized.

This handoff is saved with the architecture documents and HTML on branch `codex/ingestion-pipeline`. Resume on that branch or a checkout containing this documentation checkpoint. Recheck Git status before editing and preserve unrelated changes. The checkpoint is local; it has not been pushed.

Suggested opening for the next conversation:

> Continue planning the ingestion architecture in `libs/@local/integrations/docs/ledger-pipeline/`. Read README.md, 03-step-contracts.md and stage-1-capture.md first. Start by agreeing Capture's shared manifest and snapshot/partial-update contracts, then draft cohesive issues with acceptance criteria. Reuse the existing implementation where appropriate. We are specifying the new architecture, not implementing it yet.

## Embed in Notion

Use `/html` in Notion and upload `index.html` as an HTML block. No separate CSS, JavaScript or hosting is required. This uses Notion's [interactive HTML block](https://developers.notion.com/reference/block#html-blocks), rather than importing the file as a document.

Use a wide block (around 900 px where available) and roughly 600 px height. The three stages stay horizontal at narrower widths; scroll inside the diagram to see them. Explanations appear on hover or keyboard focus; Escape dismisses them. Replace the uploaded file to update the embedded diagram.
