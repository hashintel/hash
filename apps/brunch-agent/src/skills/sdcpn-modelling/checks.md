# Completion and checks

provenance: mixed — job/done/check adapted from Jetty; SDCPN validity and loss review from target-formalism teaching.

## Elicitation sufficiency

Enough for a first construction when:

- at least one objective is named in the expert's terms;
- one concrete case has been walked end to end;
- the IR can locate goals, the process boundary, the main activities and their order, and the resources those activities contend for;
- unknowns, assumptions, and omissions are visible rather than silently filled.

Not enough: a fluent conversation, a stable-looking IR with empty demanded sections, or headings filled by your inference without an assumption mark.

## IR checks

Before constructing:

- every section is present;
- no precise quantity or rule appears without either an expert source or an **Assumed** mark;
- conflicts are listed rather than averaged;
- construction could proceed without inventing a missing spine (what flows, what happens to it, in what order).

If a check fails, fix the IR or return to elicitation. Three tries, then deliver the partial result and say why.

## PN validity

The `pn-json` object must parse as a Petrinaut SDCPN file (`title`, `places[].name`, `transitions[].name` / `inputArcs` / `outputArcs` / `lambdaType` / `lambdaCode`). Missing canvas positions are allowed. Do not use `label` or a top-level `arcs` array. The net should have a title, at least one place and one transition, and a spelled-out order among the activities the IR claims.

A net that cannot run because order was never stated is a failed check, not a styling issue.

## Loss and uncertainty review

The delivery names:

- inferences and approximations used in construction;
- defaults you introduced;
- omissions the objective permitted;
- material the net cannot hold.

Do not silently harden a hedge into a number.

## Stopping outcomes

Name one: `complete-enough-to-parse`, `partial-with-named-gaps`, `unsupported-objective`, `expert-stopped`, `returned-to-elicitation`.
