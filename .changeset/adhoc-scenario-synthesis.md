---
"@hashintel/petrinaut-core": patch
---

Add ad-hoc scenario synthesis: `synthesizeAdHocScenario` compiles an inline initial-state + parameters definition into a code-mode `Scenario` generated at run time and never persisted, and `synthesizeAdHocOptimization` additionally turns every Optimize selection into a deterministically named scenario parameter with its optimization manifest binding.
