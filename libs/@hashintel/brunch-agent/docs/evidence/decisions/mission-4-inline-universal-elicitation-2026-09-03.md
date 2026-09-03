# Inline universal elicitation guidance into the capability skill

Date: 2026-09-03

Status: **owner-accepted pre-freeze repair.** This record authorizes the focused production and oracle change described below; it does not freeze a campaign or authorize paid calls.

## Observed failure and responsible layer

Inspection of the accepted topology found that `elicitation/references/universal-elicitation.md` had exactly one consumer and was required on every activation before substantive interviewing. The resource boundary therefore offered no conditional disclosure: activation always had to be followed by a separate model-authored `read_skill_resource` call. The boundary failed its responsibility test by adding an avoidable tool-selection, path-selection, and continuation failure point without withholding any guidance that could legitimately remain unloaded.

The responsible layer is the core `elicitation` skill's authored disclosure shape, not Flue's resource mechanism, the SDCPN plugin, the persona harness, or the accepted independent capability topology.

## Smallest accepted repair

- Move the operative contents of `references/universal-elicitation.md` into `elicitation/SKILL.md`, after the accepted capability scope.
- Remove only the obsolete reference heading/preamble and the wrapper's obsolete read/resource-discipline instructions; preserve the operative Directives, Recognition, Operations, Coverage, and Verification text unchanged.
- Stop packaging files from `elicitation/skill.ts` and delete the now-empty `references/` directory.
- Keep the independently mounted and activated `elicitation` capability skill. Do not split the universal guidance into speculative conditional resources.
- Keep plugin profiles conditional. Update SDCPN and Gherkin wording to refer to universal guidance in the activated capability rather than a deleted filename.
- Update focused tests and the accepted ruler: `sdcpn-modelling` then `elicitation` activation supplies universal guidance, while `references/profile.md` remains the required conditional read before substantive reliance.

## Regression risk and oracle

The main risk is dropping or changing operative universal guidance while moving it, or accidentally packaging a stale resource path. Compare the post-repair `SKILL.md` text from “The registers are addresses” onward with the pre-repair resource from the same marker onward; the bytes must match. Focused tests must prove that the capability has no packaged files, still contains all five guidance sections, the production `ChatAgent` still activates both skills and reads the SDCPN profile, and ordinary-workpiece checks require the profile and template rather than the deleted universal resource.

The campaign remains pre-freeze. Any protocol or retained manifest must hash the repaired `SKILL.md` and must not require or advertise `references/universal-elicitation.md`.

## Owner decision

The owner accepted this exact inlining repair in conversation on 2026-09-03 because the mandatory resource call was an avoidable failure mode. The acceptance does not authorize a broader rewrite, a register split, production prompt tuning, or a topology change.
