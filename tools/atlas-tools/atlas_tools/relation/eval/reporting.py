"""Deterministic Markdown rendering for factorial-pilot decisions."""

from collections import defaultdict

from atlas_tools.relation.eval.schema import (
    BUNDLES,
    VERDICTS,
    AnalysisDecisions,
    DurationEstimate,
    Estimate,
)

_SMALL_SAMPLE_BOUND = 30


def _estimate(value: Estimate, *, percent: bool = False, money: bool = False) -> str:
    bootstrap = (
        f"; bootstrap={value.bootstrap_defined}/{value.bootstrap_resamples} defined"
        if value.bootstrap_resamples
        else ""
    )
    if value.est is None:
        return f"undefined (n={value.n}{bootstrap})"
    scale = 100 if percent else 1
    suffix = "%" if percent else ""
    prefix = "$" if money else ""
    point = f"{prefix}{value.est * scale:.6f}{suffix}"
    if percent and value.n < _SMALL_SAMPLE_BOUND and value.successes is not None:
        point = f"{value.successes}/{value.n}"
    if value.lo is None or value.hi is None:
        return f"{point} [CI undefined] (n={value.n}{bootstrap})"
    return (
        f"{point} [{prefix}{value.lo * scale:.6f}, "
        f"{prefix}{value.hi * scale:.6f}]{suffix} "
        f"(n={value.n}{bootstrap})"
    )


def _duration_estimate(value: DurationEstimate) -> str:
    bootstrap = (
        f"; bootstrap={value.bootstrap_defined}/{value.bootstrap_resamples} defined"
        if value.bootstrap_resamples
        else ""
    )
    if value.est is None:
        return f"undefined (n={value.n}{bootstrap})"
    point = value.est.total_seconds()
    if value.lo is None or value.hi is None:
        return f"{point:.6f}s [CI undefined] (n={value.n}{bootstrap})"
    return (
        f"{point:.6f}s [{value.lo.total_seconds():.6f}s, "
        f"{value.hi.total_seconds():.6f}s] (n={value.n}{bootstrap})"
    )


def _yes(*, value: bool) -> str:
    return "yes" if value else "no"


def _summary(report: AnalysisDecisions) -> list[str]:
    policy = report.policy
    projected_cost = _estimate(report.projected_grid_cost, money=True)
    return [
        "# Factorial pilot analysis — rubric v1",
        "",
        "## Decision summary",
        "",
        f"- Pruned families: {', '.join(report.pruned_families) or 'none'}.",
        f"- Admitted shells: {', '.join(report.admitted_shells)}.",
        f"- Admitted templates: {', '.join(report.admitted_templates)}.",
        f"- Escalation order: {' → '.join(report.escalation_order)}.",
        f"- Shell-attributable precision floor: {_estimate(report.floor_error_bar, percent=True)}.",
        f"- Projected full-grid cost: {projected_cost}.",
        "",
        "Fixed analysis policy: "
        f"{policy.bootstrap_resamples} card-cluster bootstrap resamples, "
        f"seed {policy.bootstrap_seed}, {policy.ci_level:.0%} intervals, "
        f"absolute non-contested flip ceiling {policy.absolute_flip_ceiling:.0%}, "
        f"Dirichlet prior alpha={policy.dirichlet_alpha:.1f}. "
        f"Slice sampling seeds: {', '.join(map(str, report.sampling_seeds))}.",
        "",
        "Every interval below resamples cards, never votes. Counts are shown as counts; "
        "rates and continuous quantities include an interval and contributing n.",
    ]


def _coverage(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Cell coverage",
        "",
        "| family | bundle | raw | route-dropped | clean | expected | missing | "
        "missing rate | rerun |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
    ]
    lines.extend(
        f"| {stream.family_id} | {stream.bundle_id} | {stream.raw_observed} | "
        f"{stream.routing_dropped} | {stream.observed} | {stream.expected} | "
        f"{stream.missing} | {stream.missing_rate:.6%} | "
        f"{_yes(value=stream.rerun_required)} |"
        for stream in report.data_health.coverage
    )
    return lines


def _routing(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Routing fidelity",
        "",
        "| family | bundle | violations | observed | rate | rerun |",
        "| --- | --- | ---: | ---: | ---: | :---: |",
    ]
    lines.extend(
        f"| {stream.family_id} | {stream.bundle_id} | {stream.violations} | "
        f"{stream.observed} | {stream.violation_rate:.6%} | "
        f"{_yes(value=stream.rerun_required)} |"
        for stream in report.data_health.routing
    )
    return lines


def _prompt_health(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Abstention and parse retry",
        "",
        "| family | bundle | abstention | parse retry | prompt compatibility flag |",
        "| --- | --- | ---: | ---: | :---: |",
    ]
    lines.extend(
        f"| {health.family_id} | {health.bundle_id} | "
        f"{_estimate(health.abstention_rate, percent=True)} | "
        f"{_estimate(health.parse_retry_rate, percent=True)} | "
        f"{_yes(value=health.prompt_compat_flag)} |"
        for health in report.data_health.family_bundle
    )
    return lines


def _cost_health(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Token, cost, and latency distributions",
        "",
        "| family | cost coverage | billed tokens/vote | inflation vs 7.5k | latency | cost/vote |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {health.family_id} | {health.cost_reported_n}/{health.n} | "
        f"{_estimate(health.tokens_per_vote)} | "
        f"{_estimate(health.token_inflation_factor)} | "
        f"{_duration_estimate(health.latency)} | "
        f"{_estimate(health.mean_cost_usd, money=True)} |"
        for health in report.data_health.family_cost
    )
    if report.data_health.warnings:
        lines += ["", "Findings:"]
        lines += [f"- {warning}." for warning in report.data_health.warnings]
    return lines


def _phase_zero(report: AnalysisDecisions) -> list[str]:
    health = report.data_health
    lines = [
        "## Phase 0 — validation and data health",
        "",
        f"Loaded {health.votes_loaded} vote records; "
        f"{health.clean_votes} remained after required drops. "
        f"Routing violations: {health.routing_violations}; "
        f"contaminated votes: {len(health.contaminated_vote_ids)}; "
        f"duplicate vote IDs: {len(health.duplicate_vote_ids)}.",
        "",
        "Reason-length noncompliance: "
        f"{health.reasons_over_60_words} records; "
        f"{_estimate(health.reason_over_60_word_rate, percent=True)}.",
        "",
    ]
    for section in (
        _coverage(report),
        _routing(report),
        _prompt_health(report),
        _cost_health(report),
    ):
        lines.extend(section)
        lines.append("")
    return lines[:-1]


def _qualification_summary(report: AnalysisDecisions) -> list[str]:
    lines = [
        "| family | correct | P1382 | P2634 | result |",
        "| --- | ---: | :---: | :---: | --- |",
    ]
    lines.extend(
        f"| {result.family_id} | {result.correct_count}/{result.total_count} | "
        f"{_yes(value=result.p1382_correct)} | {_yes(value=result.p2634_correct)} | "
        f"{'PASS' if result.passed else 'PRUNE'} |"
        for result in report.qualification
    )
    return lines


def _holdout_tables(report: AnalysisDecisions) -> list[str]:
    holdout_ids = sorted(report.qualification[0].bundle_correctness["S1xF1"])
    lines: list[str] = []
    for result in report.qualification:
        lines += ["", f"### {result.family_id}: all-bundle holdout correctness", ""]
        lines.append("| bundle | " + " | ".join(holdout_ids) + " |")
        lines.append("| --- | " + " | ".join(":---:" for _ in holdout_ids) + " |")
        for bundle in BUNDLES:
            correctness = result.bundle_correctness.get(bundle)
            if correctness is None:
                continue
            marks = " | ".join("✓" if correctness[item] else "✗" for item in holdout_ids)
            lines.append(f"| {bundle} | {marks} |")
    return lines


def _phase_one(report: AnalysisDecisions) -> list[str]:
    return [
        "## Phase 1 — judge qualification",
        "",
        "Qualification-bundle gate (`S1xF1`): at least 5/6 and correct on both "
        "`wikidata:P1382` and `wikidata:P2634`.",
        "",
        *_qualification_summary(report),
        *_holdout_tables(report),
    ]


def _marginals(report: AnalysisDecisions) -> list[str]:
    grouped: dict[tuple[str, str], dict[str, Estimate]] = defaultdict(dict)
    for marginal in report.axis_statistics.marginals:
        grouped[(marginal.axis, marginal.level)][marginal.verdict] = marginal.rate
    lines = [
        "### Class marginals",
        "",
        "| axis | level | coincident | proximal | overlay | unclear |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {axis} | {level} | "
        + " | ".join(_estimate(values[verdict], percent=True) for verdict in VERDICTS)
        + " |"
        for (axis, level), values in sorted(grouped.items())
    )
    return lines


def _flips(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Matched-pair flip rates",
        "",
        "| axis | pair | entropy stratum | prescreen stratum | matched/expected | "
        "missing | flip rate |",
        "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {flip.axis} | {flip.level_pair} | {flip.contest_stratum} | "
        f"{flip.prescreen_stratum or 'all'} | {flip.matched_pairs}/{flip.expected_pairs} | "
        f"{flip.missing_pairs} | {_estimate(flip.rate, percent=True)} |"
        for flip in report.axis_statistics.flips
    )
    return lines


def _ordering(report: AnalysisDecisions) -> list[str]:
    ordering = report.axis_statistics.ordering
    lines = [
        "### Healthy-ordering check",
        "",
        "| source | disagreement |",
        "| --- | ---: |",
    ]
    lines.extend(
        f"| {axis} | {_estimate(ordering.rates[axis], percent=True)} |"
        for axis in ("card", "family", "template", "shell", "repeat")
    )
    result = "holds" if ordering.healthy_order_holds else "does not hold"
    lines += ["", f"Healthy ordering `card > family > template > shell`: **{result}**."]
    return lines


def _bundle_agreement(report: AnalysisDecisions) -> list[str]:
    lines: list[str] = []
    matrices = report.axis_statistics.agreement.bundle_kappa_by_family
    for family, matrix in matrices.items():
        lines += ["", f"#### {family}: bundle-vs-bundle Cohen κ", ""]
        lines.append("| | " + " | ".join(BUNDLES) + " |")
        lines.append("| --- | " + " | ".join("---:" for _ in BUNDLES) + " |")
        lines.extend(
            f"| {first} | "
            + " | ".join(_estimate(matrix[first][second]) for second in BUNDLES)
            + " |"
            for first in BUNDLES
        )
    return lines


def _family_agreement(report: AnalysisDecisions) -> list[str]:
    matrix = report.axis_statistics.agreement.qualification_family_kappa
    family_ids = sorted(matrix)
    lines = [
        "",
        "#### Qualification-bundle family-vs-family Cohen's κ",
        "",
        "| | " + " | ".join(family_ids) + " |",
        "| --- | " + " | ".join("---:" for _ in family_ids) + " |",
    ]
    lines.extend(
        f"| {first} | "
        + " | ".join(_estimate(matrix[first][second]) for second in family_ids)
        + " |"
        for first in family_ids
    )
    return lines


def _agreement(report: AnalysisDecisions) -> list[str]:
    alpha = report.axis_statistics.agreement.krippendorff_alpha
    return [
        "### Agreement",
        "",
        "Passed-family x baseline-grid, non-holdout nominal Krippendorff's alpha: "
        f"{_estimate(alpha)}.",
        *_bundle_agreement(report),
        *_family_agreement(report),
    ]


def _phase_two(report: AnalysisDecisions) -> list[str]:
    cuts = report.axis_statistics.entropy_tercile_cuts
    lines = [
        "## Phase 2 — axis statistics",
        "",
        f"Entropy tercile cuts: {cuts[0]:.6f}, {cuts[1]:.6f}. "
        "The highest-entropy ceil(n/3) cards are contested; boundary ties are ordered by "
        "relation_id.",
        "",
        "Repeat-arm self-flip noise floor: "
        f"{_estimate(report.axis_statistics.noise_floor, percent=True)}.",
        "",
    ]
    for section in (_marginals(report), _flips(report), _ordering(report), _agreement(report)):
        lines.extend(section)
        lines.append("")
    return lines[:-1]


def _admissions(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Shell/template admission",
        "",
        "| axis | level | decision | non-contested flip | family flip | rationale |",
        "| --- | --- | --- | ---: | ---: | --- |",
    ]
    lines.extend(
        f"| {decision.axis} | {decision.level} | "
        f"{'ADMIT' if decision.admitted else 'DEMOTE'} | "
        f"{_estimate(decision.non_contested_flip, percent=True)} | "
        f"{_estimate(decision.family_flip, percent=True)} | "
        f"{' '.join(decision.reasons)} |"
        for decision in report.admissions
    )
    return lines


def _escalation(report: AnalysisDecisions) -> list[str]:
    by_axis = {row.axis: row for row in report.escalation}
    rank_by_axis = {axis: rank for rank, axis in enumerate(report.escalation_order, start=1)}
    lines = [
        "### Escalation ordering",
        "",
        "| rank | axis | contested disagreement yield | cost coverage | "
        "marginal $/vote | yield/$ |",
        "| ---: | --- | ---: | ---: | ---: | ---: |",
    ]
    for axis in (*report.escalation_order, *(axis for axis in by_axis if axis not in rank_by_axis)):
        row = by_axis[axis]
        rank = str(rank_by_axis[axis]) if axis in rank_by_axis else "unrankable"
        lines.append(
            f"| {rank} | {axis} | {_estimate(row.disagreement_yield, percent=True)} | "
            f"{row.cost_reported_n}/{row.cost_eligible_n} | "
            f"{_estimate(row.marginal_cost, money=True)} | "
            f"{_estimate(row.yield_per_dollar_estimate)} |"
        )
    return lines


def _effort(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Effort policy",
        "",
        "| family | selected | baseline holdout | candidate holdout | rescues | regressions | "
        "non-contested flip | rationale |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for decision in report.effort_policy:
        candidate_correct = (
            str(decision.candidate_holdout_correct)
            if decision.candidate_holdout_correct is not None
            else "n/a"
        )
        effort_flip = (
            _estimate(decision.non_contested_flip, percent=True)
            if decision.non_contested_flip
            else "n/a"
        )
        lines.append(
            f"| {decision.family_id} | {decision.selected_effort} | "
            f"{decision.baseline_holdout_correct}/6 | {candidate_correct} | "
            f"{decision.rescues} | {decision.regressions} | {effort_flip} | "
            f"{' '.join(decision.reasons)} |"
        )
    return lines


def _cost_audit(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Cost audit",
        "",
        "| family | effort | cost basis | cost coverage | measured $/vote | "
        "projected calls | projected cost | billed tokens/vote | token inflation |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {audit.family_id} | {audit.selected_effort} | "
        f"{', '.join(audit.cost_basis_bundles)} | {audit.cost_reported_n}/{audit.n} | "
        f"{_estimate(audit.measured_cost_per_vote_usd, money=True)} | {audit.projected_calls} | "
        f"{_estimate(audit.projected_cost, money=True)} | "
        f"{_estimate(audit.billed_tokens_per_vote)} | "
        f"{_estimate(audit.token_inflation_factor)} |"
        for audit in report.cost_audit
    )
    return lines


def _nominations(report: AnalysisDecisions) -> list[str]:
    lines = [
        "### Nomination seeds (top entropy decile)",
        "",
        "| relation | entropy | votes | coincident | proximal | overlay | unclear |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {seed.relation_id} | {seed.entropy:.6f} | {seed.n_votes} | "
        + " | ".join(str(seed.vote_counts[verdict]) for verdict in VERDICTS)
        + " |"
        for seed in report.nomination_seeds
    )
    lines += [
        "",
        f"`decisions.json` contains {len(report.per_card_posteriors)} Dirichlet-smoothed "
        "per-card posteriors over admitted bundles.",
    ]
    return lines


def _phase_three(report: AnalysisDecisions) -> list[str]:
    lines = ["## Phase 3 — decisions", ""]
    for section in (
        _admissions(report),
        _escalation(report),
        _effort(report),
        _cost_audit(report),
        _nominations(report),
    ):
        lines.extend(section)
        lines.append("")
    return lines


def render_markdown(report: AnalysisDecisions) -> str:
    """Render ``report.md`` exclusively from revalidated ``decisions.json`` data."""
    lines: list[str] = []
    for phase in (_summary(report), _phase_zero(report), _phase_one(report), _phase_two(report)):
        lines.extend(phase)
        lines.append("")
    lines.extend(_phase_three(report))
    return "\n".join(lines)
