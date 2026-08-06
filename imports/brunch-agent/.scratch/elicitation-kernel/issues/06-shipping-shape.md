# Shipping shape: kernel library vs. Flue agent

Type: grilling
Status: open
Blocked by: 01, 04

## Question

What does the carve-out physically ship as — a kernel library that a thin Flue agent (and later Petrinaut/web/brunch hosts) embeds, or a Flue agent as the product itself — and what is the viable/ideal package structure?

Sub-questions:

- Given the Flue deep-read: is library-embedded-in-agent natural in Flue, or fighting the framework?
- What does each option cost the Petrinaut-UI and web-UI futures?
- Package topology: one package or kernel + packs as separate packages? Where do dev targets (elicit-gherkin, elicit-lean) live?
- What is the local dev loop (run against both targets) vs. the remote deploy story?

Input from Contract decomposition (issue 04): the plugin **SDK surface** is part of the shipping shape — standard machinery for evidence anchoring, claim identity, issue construction, schema validation, retries, idempotency, state-delta application, tracing, test fixtures, and a **local simulation harness** (fixture-driven pack testing: conversation in → expected claims/issues/projections out; "debugging should not require reading an entire agent transcript"). The black-box authoring test and change-surface metric are the acceptance bar.
