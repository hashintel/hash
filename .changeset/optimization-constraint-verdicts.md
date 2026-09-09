---
"@hashintel/petrinaut": patch
---

A study with constraints run in the browser now evaluates them: a step whose parameters break a parameter constraint is pruned before it runs and greyed as infeasible everywhere a step is drawn, every run reports whether each state constraint held throughout, and the study view shows a Constraints card, a Steps clear stat and a Runs passed column, every rate as a raw fraction beside its percentage. The create drawer gains a Pass threshold setting (95 percent by default). The objective is unchanged by any verdict.
