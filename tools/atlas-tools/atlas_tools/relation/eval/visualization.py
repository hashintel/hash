"""Matplotlib visualizations for relation-analysis decisions."""

# ruff: noqa: E501

import base64
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from html import escape
from os import PathLike
from pathlib import Path
from textwrap import fill

import matplotlib as mpl

mpl.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.axes import Axes
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.colors import ListedColormap
from matplotlib.figure import Figure

from atlas_tools.relation.eval.schema import BUNDLES, VERDICTS, AnalysisDecisions, Estimate

_GRAPH_FILENAMES = (
    "data-health.png",
    "qualification.png",
    "verdict-marginals.png",
    "flip-rates.png",
    "agreement.png",
    "cost-and-escalation.png",
    "card-posteriors.png",
)
_ALPHA_STRONG = 0.8
_ALPHA_TENTATIVE = 0.667
_NEAR_COMPLETE_DATA = 0.98
_MANDATORY_PROBES = frozenset({"wikidata:P1382", "wikidata:P2634"})

_VERDICT_COLORS = {
    "coincident": "#4c78a8",
    "proximal": "#59a14f",
    "overlay": "#f28e2b",
    "unclear": "#e15759",
}


@dataclass(frozen=True)
class VisualizationRunResult:
    """Paths written by one visualization run."""

    graphs: tuple[Path, ...]
    explainer_md: Path
    report_pdf: Path
    report_html: Path


def _save(fig: Figure, path: Path) -> None:
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def _no_data(ax: Axes, message: str = "No defined estimates") -> None:
    ax.text(0.5, 0.5, message, ha="center", va="center", transform=ax.transAxes)
    ax.set_axis_off()


def _estimate_error(estimate: Estimate) -> tuple[float, float] | None:
    if estimate.est is None or estimate.lo is None or estimate.hi is None:
        return None
    return estimate.est - estimate.lo, estimate.hi - estimate.est


def _plot_data_health(decisions: AnalysisDecisions, path: Path) -> None:
    health = decisions.data_health
    families = sorted(
        {row.family_id for row in health.coverage} | {row.family_id for row in health.routing}
    )
    labels = [f"{family}\n{bundle}" for family in families for bundle in BUNDLES]
    coverage = {(row.family_id, row.bundle_id): row.missing_rate for row in health.coverage}
    routing = {(row.family_id, row.bundle_id): row.violation_rate for row in health.routing}
    missing_values = [
        coverage.get((family, bundle), np.nan) for family in families for bundle in BUNDLES
    ]
    routing_values = [
        routing.get((family, bundle), np.nan) for family in families for bundle in BUNDLES
    ]

    fig, ax = plt.subplots(figsize=(max(10, len(labels) * 0.55), 5.5))
    if not labels:
        _no_data(ax, "No coverage or routing streams")
    else:
        x = np.arange(len(labels))
        width = 0.4
        ax.bar(x - width / 2, missing_values, width, label="Missing rate")
        ax.bar(x + width / 2, routing_values, width, label="Routing violation rate")
        ax.axhline(
            decisions.policy.stream_missing_rerun_rate,
            color="#4c78a8",
            linestyle="--",
            linewidth=1,
            label="Missing rerun threshold",
        )
        ax.axhline(
            decisions.policy.routing_rerun_rate,
            color="#f28e2b",
            linestyle=":",
            linewidth=1,
            label="Routing rerun threshold",
        )
        ax.set_xticks(x, labels, rotation=55, ha="right")
        ax.set_ylabel("Rate")
        ax.set_ylim(bottom=0)
        ax.legend(ncols=2)
    ax.set_title(
        f"Data health — {health.clean_votes:,}/{health.votes_loaded:,} clean votes, "
        f"{len(health.warnings)} warning(s)"
    )
    _save(fig, path)


def _plot_qualification(decisions: AnalysisDecisions, path: Path) -> None:
    rows = sorted(decisions.qualification, key=lambda row: row.family_id)
    fig, axes = plt.subplots(
        1,
        2,
        figsize=(15, max(4.5, len(rows) * 0.75)),
        gridspec_kw={"width_ratios": (1, 2.4)},
    )
    score_ax, answers_ax = axes
    if not rows:
        _no_data(score_ax, "No judge families")
        answers_ax.set_axis_off()
    else:
        families = [row.family_id for row in rows]
        y = np.arange(len(rows))
        values = [row.correct_count / row.total_count if row.total_count else 0.0 for row in rows]
        colors = ["#34845b" if row.passed else "#bf4b4b" for row in rows]
        bars = score_ax.barh(y, values, color=colors, height=0.58)
        score_ax.set_yticks(y, families)
        score_ax.invert_yaxis()
        score_ax.set_xlim(0, 1.16)
        score_ax.set_xlabel("Holdout correctness")
        score_ax.grid(axis="x", color="#e8ebef", linewidth=0.8)
        score_ax.set_axisbelow(True)
        for bar, row in zip(bars, rows, strict=True):
            score_ax.text(
                bar.get_width() + 0.02,
                bar.get_y() + bar.get_height() / 2,
                f"{row.correct_count}/{row.total_count}  {'PASS' if row.passed else 'PRUNE'}",
                va="center",
                fontsize=9,
            )
        score_ax.set_title("Qualification gate")

        holdout_ids = sorted(rows[0].holdout_expected)
        matrix = np.zeros((len(rows), len(holdout_ids)), dtype=int)
        for row_index, row in enumerate(rows):
            for column, relation_id in enumerate(holdout_ids):
                actual = row.holdout_verdicts.get(relation_id)
                expected = row.holdout_expected.get(relation_id, [])
                # 0 missing | 1 wrong | 2 accepted alternate reading | 3 canonical
                if actual is None:
                    state = 0
                elif expected and actual == expected[0]:
                    state = 3
                elif actual in expected:
                    state = 2
                else:
                    state = 1
                matrix[row_index, column] = state
        answers_ax.imshow(
            matrix,
            cmap=ListedColormap(("#e8ebef", "#f4c7c7", "#f3dfa5", "#c8e6d4")),
            vmin=-0.5,
            vmax=3.5,
            aspect="auto",
        )
        answer_labels = []
        for relation_id in holdout_ids:
            accepted = rows[0].holdout_expected[relation_id]
            mandatory = "*" if relation_id in _MANDATORY_PROBES else ""
            lines = [f"{relation_id}{mandatory}", f"expected: {accepted[0]}"]
            lines.extend(f"or {alternate}" for alternate in accepted[1:])
            answer_labels.append("\n".join(lines))
        answers_ax.set_xticks(np.arange(len(holdout_ids)), answer_labels, fontsize=8)
        answers_ax.set_yticks(y, families)
        answers_ax.tick_params(top=True, labeltop=True, bottom=False, labelbottom=False)
        for row_index, row in enumerate(rows):
            for column, relation_id in enumerate(holdout_ids):
                answers_ax.text(
                    column,
                    row_index,
                    row.holdout_verdicts.get(relation_id) or "—",
                    ha="center",
                    va="center",
                    fontsize=8,
                    color="#172033",
                )
        answers_ax.set_title(
            "Actual qualification answers — green: canonical, "
            "amber: accepted alternate reading, red: miss  (* mandatory probe)",
            pad=42,
        )
    fig.suptitle("Judge-family qualification: score and answer-level evidence", fontweight="bold")
    fig.tight_layout()
    _save(fig, path)


def _plot_marginals(decisions: AnalysisDecisions, path: Path) -> None:
    rows = decisions.axis_statistics.marginals
    axes_present = [
        axis for axis in ("family", "shell", "template") if any(row.axis == axis for row in rows)
    ]
    fig, plot_axes = plt.subplots(
        max(1, len(axes_present)),
        1,
        figsize=(10, max(4, len(axes_present) * 3.5)),
        squeeze=False,
    )
    if not axes_present:
        _no_data(plot_axes[0, 0], "No marginal estimates")
    for ax, axis_name in zip(plot_axes[:, 0], axes_present, strict=False):
        axis_rows = [row for row in rows if row.axis == axis_name]
        levels = list(dict.fromkeys(row.level for row in axis_rows))
        x = np.arange(len(levels))
        for verdict in VERDICTS:
            lookup = {
                row.level: row.rate.est
                for row in axis_rows
                if row.verdict == verdict and row.rate.est is not None
            }
            ax.plot(
                x,
                [lookup.get(level, np.nan) for level in levels],
                marker="o",
                label=verdict,
                color=_VERDICT_COLORS[verdict],
            )
        ax.set_xticks(x, levels, rotation=30, ha="right")
        ax.set_ylim(0, 1)
        ax.set_ylabel("Verdict rate")
        ax.set_title(axis_name.title())
        ax.legend(ncols=4)
    fig.suptitle("Verdict marginals by experimental axis")
    fig.tight_layout()
    _save(fig, path)


def _plot_flip_rates(decisions: AnalysisDecisions, path: Path) -> None:
    rows = [row for row in decisions.axis_statistics.flips if row.rate.est is not None]
    fig, ax = plt.subplots(figsize=(max(10, len(rows) * 0.55), 6))
    if not rows:
        _no_data(ax)
    else:
        labels = [
            f"{row.axis}: {row.level_pair}\n{row.contest_stratum}"
            + (f" / {row.prescreen_stratum}" if row.prescreen_stratum else "")
            for row in rows
        ]
        x = np.arange(len(rows))
        for index, row in enumerate(rows):
            value = row.rate.est
            if value is None:
                continue
            error = _estimate_error(row.rate)
            ax.errorbar(
                index,
                value,
                yerr=np.array(error).reshape(2, 1) if error else None,
                fmt="o",
                capsize=4,
                color="#4c78a8",
            )
        floor = decisions.axis_statistics.noise_floor.est
        if floor is not None:
            ax.axhline(floor, color="#e15759", linestyle="--", label=f"Noise floor ({floor:.3f})")
        ax.axhline(
            decisions.policy.absolute_flip_ceiling,
            color="#f28e2b",
            linestyle=":",
            label=f"Absolute ceiling ({decisions.policy.absolute_flip_ceiling:.3f})",
        )
        ax.set_xticks(x, labels, rotation=55, ha="right")
        ax.set_ylabel("Flip rate")
        ax.set_ylim(bottom=0)
        ax.legend()
    ax.set_title(
        "Matched-pair flip rates — lower is better; "
        f"{decisions.policy.absolute_flip_ceiling:.0%} is the maximum tolerated, not the target"
    )
    _save(fig, path)


def _estimate_matrix[Label: str](
    labels: Sequence[Label],
    lookup: Callable[[Label, Label], Estimate | None],
) -> np.ndarray:
    return np.array(
        [
            [
                estimate.est
                if (estimate := lookup(row, column)) and estimate.est is not None
                else np.nan
                for column in labels
            ]
            for row in labels
        ],
        dtype=float,
    )


def _draw_matrix(ax: Axes, matrix: np.ndarray, labels: Sequence[str], title: str) -> None:
    masked = np.ma.masked_invalid(matrix)
    image = ax.imshow(masked, vmin=-1, vmax=1, cmap="RdYlGn")
    ax.set_xticks(np.arange(len(labels)), labels, rotation=45, ha="right")
    ax.set_yticks(np.arange(len(labels)), labels)
    for row in range(len(labels)):
        for column in range(len(labels)):
            value = matrix[row, column]
            ax.text(
                column,
                row,
                "—" if np.isnan(value) else f"{value:.2f}",
                ha="center",
                va="center",
                fontsize=7,
            )
    ax.set_title(title)
    plt.colorbar(image, ax=ax, fraction=0.046, pad=0.04, label="Agreement")


def _plot_agreement(decisions: AnalysisDecisions, path: Path) -> None:
    agreement = decisions.axis_statistics.agreement
    bundle_by_family = agreement.bundle_kappa_by_family
    family_labels = sorted(agreement.qualification_family_kappa)
    panel_count = 1 + len(bundle_by_family)
    columns = min(2, panel_count)
    rows = (panel_count + columns - 1) // columns
    fig, axes = plt.subplots(rows, columns, figsize=(columns * 7, rows * 6), squeeze=False)
    flat_axes = list(axes.flat)

    family_matrix = _estimate_matrix(
        family_labels,
        lambda row, column: agreement.qualification_family_kappa.get(row, {}).get(column),
    )
    _draw_matrix(flat_axes[0], family_matrix, family_labels, "Qualification family κ")
    for ax, family in zip(flat_axes[1:], sorted(bundle_by_family), strict=False):
        family_lookup = bundle_by_family[family]
        matrix = _estimate_matrix(
            BUNDLES,
            lambda row, column, lookup=family_lookup: lookup.get(row, {}).get(column),
        )
        _draw_matrix(ax, matrix, BUNDLES, f"Bundle κ — {family}")
    for ax in flat_axes[panel_count:]:
        ax.set_axis_off()
    qualified_alpha = agreement.qualified_panel_krippendorff_alpha.est
    all_alpha = agreement.all_candidate_krippendorff_alpha.est
    qualified_text = "unavailable" if qualified_alpha is None else f"{qualified_alpha:.3f}"
    all_text = "unavailable" if all_alpha is None else f"{all_alpha:.3f}"
    fig.suptitle(
        "Agreement matrices — Krippendorff α: "  # noqa: RUF001
        f"qualified panel {qualified_text} · all candidates {all_text}"
    )
    fig.tight_layout()
    _save(fig, path)


def _plot_cost_and_escalation(decisions: AnalysisDecisions, path: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))
    costs = sorted(decisions.cost_audit, key=lambda row: row.family_id)
    defined_costs = [row for row in costs if row.projected_cost.est is not None]
    if not defined_costs:
        _no_data(axes[0], "No defined projected costs")
    else:
        axes[0].bar(
            [row.family_id for row in defined_costs],
            [row.projected_cost.est for row in defined_costs],
            color="#4c78a8",
        )
        axes[0].tick_params(axis="x", rotation=30)
        axes[0].set_ylabel("Projected cost (USD)")
    axes[0].set_title("Projected full-grid cost by family")

    escalation = [
        row for row in decisions.escalation if row.yield_per_dollar_estimate.est is not None
    ]
    if not escalation:
        _no_data(axes[1], "No rankable escalation axes")
    else:
        ordered = sorted(
            escalation,
            key=lambda row: row.yield_per_dollar_estimate.est or 0,
            reverse=True,
        )
        axes[1].barh(
            [row.axis for row in reversed(ordered)],
            [row.yield_per_dollar_estimate.est for row in reversed(ordered)],
            color="#59a14f",
        )
        axes[1].set_xlabel("Disagreement yield per USD")
    axes[1].set_title("Escalation efficiency")
    fig.tight_layout()
    _save(fig, path)


def _plot_card_posteriors(decisions: AnalysisDecisions, path: Path) -> None:
    entropy = {row.relation_id: row.entropy for row in decisions.nomination_seeds}
    posteriors = [row for row in decisions.per_card_posteriors if row.relation_id in entropy]
    posteriors.sort(key=lambda row: (-entropy[row.relation_id], row.relation_id))
    posteriors = posteriors[:20]

    fig, ax = plt.subplots(figsize=(11, max(5, len(posteriors) * 0.45)))
    if not posteriors:
        _no_data(ax, "No nominated card posteriors")
    else:
        y = np.arange(len(posteriors))
        left = np.zeros(len(posteriors))
        for verdict in VERDICTS:
            values = np.array([row.probabilities[verdict] for row in posteriors])
            ax.barh(y, values, left=left, label=verdict, color=_VERDICT_COLORS[verdict])
            left += values
        labels = [f"{row.relation_id}  (H={entropy[row.relation_id]:.2f})" for row in posteriors]
        ax.set_yticks(y, labels)
        ax.invert_yaxis()
        ax.set_xlim(0, 1)
        ax.set_xlabel("Posterior probability")
        ax.legend(ncols=4, loc="lower center", bbox_to_anchor=(0.5, 1.01))
    ax.set_title("Highest-entropy nominated relation cards")
    _save(fig, path)


def _compact_estimate(
    estimate: Estimate,
    *,
    percent: bool = False,
    money: bool = False,
) -> str:
    if estimate.est is None:
        return "Unavailable"
    scale = 100 if percent else 1
    prefix = "$" if money else ""
    suffix = "%" if percent else ""
    precision = 1 if percent or money else 3
    point = f"{prefix}{estimate.est * scale:.{precision}f}{suffix}"
    if estimate.lo is None or estimate.hi is None:
        return point
    interval = (
        f"{prefix}{estimate.lo * scale:.{precision}f}{suffix}–"  # noqa: RUF001
        f"{prefix}{estimate.hi * scale:.{precision}f}{suffix}"
    )
    return f"{point} ({interval})"


def _frequency(rate: float) -> str:
    if rate <= 0:
        return "no observed cases"
    return f"about 1 in {round(1 / rate):,} cases"


def _noise_interpretation(estimate: Estimate, ceiling: float) -> str:
    if estimate.est is None:
        return "There was not enough repeat data to assess self-consistency."
    frequency = _frequency(estimate.est)
    if math.isclose(estimate.est, ceiling):
        return (
            f"Repeat inconsistency is exactly at the {ceiling:.0%} maximum ({frequency}); "
            "this is borderline and leaves no safety margin."
        )
    if estimate.est < ceiling:
        if estimate.hi is not None and estimate.hi > ceiling:
            return (
                f"The point estimate is below the {ceiling:.0%} maximum ({frequency}), but "
                "uncertainty does not rule out an unacceptable rate."
            )
        if estimate.est == 0:
            return "No repeat flips were observed; the same setup consistently returned the same answer."
        return (
            f"Repeat inconsistency is below the {ceiling:.0%} maximum ({frequency}), but lower "
            "is still better."
        )
    return (
        f"Repeat inconsistency exceeded the {ceiling:.0%} maximum ({frequency}); identical "
        "setups changed answers too often."
    )


def _alpha_band(value: float) -> str:
    if value >= _ALPHA_STRONG:
        return "strong"
    if value >= _ALPHA_TENTATIVE:
        return "tentative"
    return "weak"


def _alpha_interpretation(estimate: Estimate) -> str:
    if estimate.est is None:
        return "There was not enough shared rating data to assess agreement."
    band = _alpha_band(estimate.est)
    if band == "strong":
        conclusion = "Agreement beyond chance met the 0.8 threshold for dependable use."
    elif band == "tentative":
        conclusion = "Agreement cleared 0.667 only for tentative conclusions; disagreements still need review."
    else:
        conclusion = "Agreement was below 0.667 and too weak to treat judges as interchangeable."
    if estimate.lo is not None and estimate.hi is not None:
        low_band = _alpha_band(estimate.lo)
        high_band = _alpha_band(estimate.hi)
        if low_band != high_band:
            conclusion += f" The interval spans {low_band} to {high_band} agreement."
    return conclusion


def _shell_interpretation(estimate: Estimate, ceiling: float) -> str:
    if estimate.est is None:
        return "There was not enough matched data to assess prompt-shell sensitivity."
    frequency = _frequency(estimate.est)
    if math.isclose(estimate.est, ceiling):
        return (
            f"Shell sensitivity is exactly at the {ceiling:.0%} maximum ({frequency}); this is "
            "borderline and leaves no safety margin."
        )
    if estimate.est < ceiling:
        if estimate.hi is not None and estimate.hi > ceiling:
            return (
                f"The point estimate is below the {ceiling:.0%} maximum ({frequency}), but "
                "uncertainty allows an unacceptable shell effect."
            )
        if estimate.est == 0:
            return "No shell-attributable flips were observed on otherwise stable verdicts."
        return f"Shell sensitivity is below the {ceiling:.0%} maximum ({frequency}), but lower is better."
    return (
        f"Shell sensitivity exceeded the {ceiling:.0%} maximum ({frequency}); wording changed "
        "stable verdicts too often."
    )


def _data_interpretation(decisions: AnalysisDecisions) -> str:
    health = decisions.data_health
    if not health.votes_loaded:
        return "No votes were available for analysis."
    retained = health.clean_votes / health.votes_loaded
    if retained >= _NEAR_COMPLETE_DATA and not health.warnings:
        return "Nearly all collected votes passed validation, with no data-health warnings."
    excluded = health.votes_loaded - health.clean_votes
    return (
        f"{excluded:,} vote(s) were excluded by validation or routing checks; review the "
        f"{len(health.warnings)} warning(s) before relying on the recommendation."
    )


def _point_estimate(estimate: Estimate) -> str:
    return "unavailable" if estimate.est is None else f"{estimate.est:.3f}"


def _agreement_comparison(all_candidates: Estimate, qualified: Estimate) -> str:
    if all_candidates.est is None or qualified.est is None:
        return "The change produced by qualification could not be estimated."
    difference = qualified.est - all_candidates.est
    if math.isclose(difference, 0):
        return "Qualification did not materially change measured agreement."
    direction = "raised" if difference > 0 else "lowered"
    return f"Qualification {direction} measured agreement by {abs(difference):.3f}."


def _section_title(ax: Axes, title: str) -> None:
    ax.text(
        0,
        1.04,
        title,
        transform=ax.transAxes,
        fontsize=12,
        fontweight="bold",
        color="#172033",
        va="bottom",
    )


def _plot_results_overview(  # noqa: PLR0915
    decisions: AnalysisDecisions,
    path: Path,
) -> None:
    fig = plt.figure(figsize=(16, 9), facecolor="#f7f8fa")
    header = fig.add_axes((0, 0.84, 1, 0.16))
    header.set_facecolor("#172033")
    header.set_xticks([])
    header.set_yticks([])
    for spine in header.spines.values():
        spine.set_visible(False)
    header.text(
        0.045,
        0.64,
        "Relation judge pilot — results at a glance",
        color="white",
        fontsize=25,
        fontweight="bold",
        va="center",
    )
    header.text(
        0.045,
        0.25,
        f"Rubric {decisions.rubric_version}  •  Analysis policy {decisions.policy.version}",
        color="#c7cfdd",
        fontsize=11,
        va="center",
    )

    qualification_ax = fig.add_axes((0.055, 0.50, 0.40, 0.25), facecolor="white")
    recommendation_ax = fig.add_axes((0.51, 0.50, 0.435, 0.25), facecolor="white")
    reliability_ax = fig.add_axes((0.055, 0.13, 0.25, 0.25), facecolor="white")
    health_ax = fig.add_axes((0.375, 0.13, 0.25, 0.25), facecolor="white")
    economics_ax = fig.add_axes((0.695, 0.13, 0.25, 0.25), facecolor="white")
    panels = (qualification_ax, recommendation_ax, reliability_ax, health_ax, economics_ax)
    for ax in panels:
        for spine in ax.spines.values():
            spine.set_color("#dfe3e8")

    _section_title(qualification_ax, "Judge qualification")
    qualification = sorted(decisions.qualification, key=lambda row: row.family_id)
    if qualification:
        y = np.arange(len(qualification))
        rates = [
            row.correct_count / row.total_count if row.total_count else 0 for row in qualification
        ]
        qualification_ax.barh(
            y,
            rates,
            color=["#34845b" if row.passed else "#bf4b4b" for row in qualification],
            height=0.55,
        )
        qualification_ax.set_yticks(y, [row.family_id for row in qualification])
        qualification_ax.invert_yaxis()
        qualification_ax.set_xlim(0, 1.02)
        qualification_ax.set_xlabel("Holdout correctness")
        qualification_ax.grid(axis="x", color="#e8ebef", linewidth=0.8)
        qualification_ax.set_axisbelow(True)
        for index, row in enumerate(qualification):
            qualification_ax.text(
                rates[index] + 0.015,
                index,
                f"{row.correct_count}/{row.total_count}  {'PASS' if row.passed else 'PRUNE'}",
                va="center",
                fontsize=10,
                color="#172033",
            )
    else:
        _no_data(qualification_ax, "No qualification results")

    _section_title(recommendation_ax, "Recommended full-grid configuration")
    recommendation_ax.set_xticks([])
    recommendation_ax.set_yticks([])
    passed = [row.family_id for row in qualification if row.passed]
    efforts = ", ".join(
        f"{row.family_id} → {row.selected_effort}"
        for row in decisions.effort_policy
        if row.family_id in passed
    )
    recommendation_lines = (
        ("Qualified families", ", ".join(passed) or "None"),
        ("Pruned families", ", ".join(decisions.pruned_families) or "None"),
        ("Prompt shells", ", ".join(decisions.admitted_shells)),
        ("Templates", ", ".join(decisions.admitted_templates)),
        ("Reasoning effort", efforts or "No qualified families"),
    )
    for index, (label, value) in enumerate(recommendation_lines):
        y_position = 0.86 - index * 0.19
        recommendation_ax.text(0.04, y_position, label, color="#667085", fontsize=10, va="center")
        recommendation_ax.text(
            0.34,
            y_position,
            fill(value, 48),
            color="#172033",
            fontsize=11,
            fontweight="bold",
            va="center",
        )

    _section_title(reliability_ax, "Reliability")
    reliability_ax.set_xticks([])
    reliability_ax.set_yticks([])
    ceiling = decisions.policy.absolute_flip_ceiling
    reliability_metrics = (
        (
            "Repeat noise floor",
            _compact_estimate(decisions.axis_statistics.noise_floor, percent=True),
            _noise_interpretation(decisions.axis_statistics.noise_floor, ceiling),
        ),
        (
            "Agreement α (qualified / all)",  # noqa: RUF001
            f"{_point_estimate(decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha)} / "
            f"{_point_estimate(decisions.axis_statistics.agreement.all_candidate_krippendorff_alpha)}",
            _alpha_interpretation(
                decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha
            ),
        ),
        (
            "Shell sensitivity",
            _compact_estimate(decisions.floor_error_bar, percent=True),
            _shell_interpretation(decisions.floor_error_bar, ceiling),
        ),
    )
    for index, (label, value, interpretation) in enumerate(reliability_metrics):
        y_position = 0.88 - index * 0.31
        reliability_ax.text(0.06, y_position, label, fontsize=10, color="#667085", va="center")
        reliability_ax.text(
            0.94,
            y_position,
            value,
            fontsize=12,
            color="#172033",
            fontweight="bold",
            ha="right",
            va="center",
        )
        reliability_ax.text(
            0.06,
            y_position - 0.11,
            fill(interpretation, 58),
            fontsize=7.5,
            color="#667085",
            va="top",
        )

    _section_title(health_ax, "Data quality")
    health_ax.set_xticks([])
    health_ax.set_yticks([])
    health = decisions.data_health
    clean_rate = health.clean_votes / health.votes_loaded if health.votes_loaded else 0
    health_ax.barh([0], [clean_rate], color="#34845b", height=0.22)
    health_ax.barh([0], [1 - clean_rate], left=[clean_rate], color="#e8ebef", height=0.22)
    health_ax.set_xlim(0, 1)
    health_ax.text(
        0,
        0.23,
        f"{health.clean_votes:,} / {health.votes_loaded:,} clean votes ({clean_rate:.1%})",
        fontsize=11,
        fontweight="bold",
        color="#172033",
    )
    health_ax.text(
        0,
        -0.30,
        f"Routing violations: {health.routing_violations}\n"
        f"Contaminated votes: {len(health.contaminated_vote_ids)}\n"
        f"Analysis warnings: {len(health.warnings)}",
        fontsize=10,
        color="#667085",
        linespacing=1.7,
        va="top",
    )
    health_ax.set_ylim(-0.85, 0.55)

    _section_title(economics_ax, "Cost and future escalation policy")
    economics_ax.set_xticks([])
    economics_ax.set_yticks([])
    economics_ax.text(0.06, 0.79, "Projected full-grid cost", color="#667085", fontsize=10)
    economics_ax.text(
        0.06,
        0.62,
        _compact_estimate(decisions.projected_grid_cost, money=True),
        color="#172033",
        fontsize=17,
        fontweight="bold",
    )
    economics_ax.text(0.06, 0.38, "Recommended order for future runs", color="#667085", fontsize=10)
    economics_ax.text(
        0.06,
        0.17,
        "  →  ".join(decisions.escalation_order) or "No rankable escalation axes",
        color="#172033",
        fontsize=12,
        fontweight="bold",
    )

    fig.text(
        0.055,
        0.055,
        "Intervals are card-cluster bootstrap intervals where defined. “Unavailable” "
        "means the pilot did not support a stable estimate; it does not mean zero.",
        fontsize=9.5,
        color="#667085",
    )
    _save(fig, path)


def _render_results_explainer(decisions: AnalysisDecisions) -> str:
    qualification = sorted(decisions.qualification, key=lambda row: row.family_id)
    passed = [row.family_id for row in qualification if row.passed]
    effort = ", ".join(
        f"**{row.family_id}** at **{row.selected_effort}** effort"
        for row in decisions.effort_policy
        if row.family_id in passed
    )
    health = decisions.data_health
    warnings = (
        "\n".join(f"- {warning}" for warning in health.warnings)
        if health.warnings
        else "- The analysis emitted no data-health warnings."
    )
    return "\n".join(
        (
            "# Relation judge pilot — results at a glance",
            "",
            "## Bottom line",
            "",
            f"- **Qualified judge families:** {', '.join(passed) or 'none'}.",
            f"- **Pruned judge families:** {', '.join(decisions.pruned_families) or 'none'}.",
            "- **Recommended prompt configuration:** shells "
            f"{', '.join(decisions.admitted_shells)}; templates "
            f"{', '.join(decisions.admitted_templates)}.",
            f"- **Recommended reasoning effort:** {effort or 'no qualified families'}.",
            f"- **Recommended future escalation order for contested cards:** "
            f"{' → '.join(decisions.escalation_order) or 'no rankable axes'}.",
            "",
            "## Evidence behind the recommendation",
            "",
            f"- **Data retained:** {health.clean_votes:,} of {health.votes_loaded:,} votes "
            f"({health.clean_votes / health.votes_loaded:.1%} clean). "
            f"{_data_interpretation(decisions)}"
            if health.votes_loaded
            else "- **Data retained:** no votes were loaded.",
            f"- **Repeat-arm noise floor:** "
            f"{_compact_estimate(decisions.axis_statistics.noise_floor, percent=True)}. "
            f"{_noise_interpretation(decisions.axis_statistics.noise_floor, decisions.policy.absolute_flip_ceiling)}",
            f"- **Qualified-panel agreement:** Krippendorff α "  # noqa: RUF001
            f"{_compact_estimate(decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha)}. "
            f"{_alpha_interpretation(decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha)}",
            f"- **All-candidate agreement:** Krippendorff α "  # noqa: RUF001
            f"{_compact_estimate(decisions.axis_statistics.agreement.all_candidate_krippendorff_alpha)}. "
            f"{_agreement_comparison(decisions.axis_statistics.agreement.all_candidate_krippendorff_alpha, decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha)}",
            "- Both alpha measures use the complete experimental shell/template grid, not only "
            "the prompt configuration admitted for production.",
            f"- **Shell sensitivity** (the technical precision-floor measure): "
            f"{_compact_estimate(decisions.floor_error_bar, percent=True)}. "
            f"{_shell_interpretation(decisions.floor_error_bar, decisions.policy.absolute_flip_ceiling)}",
            f"- **Projected full-grid cost:** "
            f"{_compact_estimate(decisions.projected_grid_cost, money=True)}.",
            "",
            "## How to read the image",
            "",
            "- **Judge qualification** shows each actual holdout answer against truth. A family "
            "passes by scoring at least 5/6 and answering both mandatory probes correctly.",
            "- **Reliability** summarizes repeat consistency, cross-family agreement, and "
            "prompt-shell sensitivity. Parentheses show the confidence interval where defined.",
            "- **Data quality** shows how much of the collected vote set survived "
            "contamination, routing, and validation checks.",
            "- **Cost and future escalation policy** gives the estimated full-grid spend "
            "and the preferred order for resolving contested cards in a future run.",
            "",
            "## Caveats",
            "",
            warnings,
            "- The pilot estimated escalation yield and cost to recommend an order. It did not "
            "execute a live, dynamic escalation workflow.",
            f"- Intervals use {decisions.policy.bootstrap_resamples:,} card-cluster bootstrap "
            f"resamples at {decisions.policy.ci_level:.0%} confidence. Cards—not individual "
            "votes—are the resampling unit.",
            "- An unavailable estimate means the pilot did not support a stable estimate; "
            "it should not be interpreted as zero.",
            "",
        )
    )


def _write_pdf_report(graphs: Sequence[Path], path: Path) -> None:
    with PdfPages(
        path,
        metadata={
            "Title": "Relation judge pilot results",
            "Subject": "Factorial pilot analysis and decision summary",
        },
    ) as pdf:
        for graph in graphs:
            image = plt.imread(graph)
            fig = plt.figure(figsize=(16, 9), facecolor="white")
            ax = fig.add_axes((0.03, 0.04, 0.94, 0.91))
            ax.imshow(image)
            ax.set_axis_off()
            if graph.name != "results-overview.png":
                fig.suptitle(
                    graph.stem.replace("-", " ").title(),
                    fontsize=16,
                    fontweight="bold",
                    color="#172033",
                )
            pdf.savefig(fig, bbox_inches="tight", facecolor="white")
            plt.close(fig)


def _image_data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _render_results_html(decisions: AnalysisDecisions, graphs: Sequence[Path]) -> str:
    qualification = sorted(decisions.qualification, key=lambda row: row.family_id)
    passed = [row.family_id for row in qualification if row.passed]
    warning_items = "".join(
        f"<li>{escape(warning)}</li>" for warning in decisions.data_health.warnings
    )
    if not warning_items:
        warning_items = "<li>No data-health warnings were emitted.</li>"
    detail_figures = "".join(
        (
            '<figure class="detail">'
            f'<img src="{_image_data_uri(graph)}" alt="{escape(graph.stem)} visualization">'
            f"<figcaption>{escape(graph.stem.replace('-', ' ').title())}</figcaption>"
            "</figure>"
        )
        for graph in graphs
        if graph.name != "results-overview.png"
    )
    clean_rate = (
        decisions.data_health.clean_votes / decisions.data_health.votes_loaded
        if decisions.data_health.votes_loaded
        else 0
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relation judge pilot results</title>
<style>
:root {{ color-scheme: light; --ink:#172033; --muted:#667085; --line:#dfe3e8;
  --surface:#fff; --background:#f7f8fa; --success:#28734d; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--background); color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
header {{ padding:48px max(5vw,24px); background:var(--ink); color:white; }}
header h1 {{ margin:0 0 8px; font-size:clamp(30px,4vw,52px); letter-spacing:-.025em; }}
header p {{ margin:0; color:#c7cfdd; }}
main {{ width:min(1180px,90vw); margin:44px auto 80px; }}
h2 {{ margin:44px 0 16px; font-size:24px; }}
.lede {{ max-width:72ch; font-size:19px; }}
.decision {{ display:flex; flex-wrap:wrap; gap:28px; padding:24px 0;
  border-top:1px solid var(--line); border-bottom:1px solid var(--line); }}
.decision div {{ min-width:190px; flex:1; }}
.decision span {{ display:block; color:var(--muted); font-size:14px; }}
.decision strong {{ display:block; margin-top:4px; font-size:18px; }}
.overview {{ display:block; width:100%; background:white; }}
.evidence {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:24px; }}
.evidence section {{ padding:20px 0; border-top:2px solid var(--ink); }}
.evidence h3 {{ margin:0 0 8px; font-size:16px; }}
.evidence p {{ margin:0; }}
.evidence .meaning {{ margin-top:8px; color:var(--muted); font-size:14px; }}
.note {{ padding:20px 24px; background:#eef3f8; }}
.details {{ display:grid; gap:32px; }}
.detail {{ margin:0; padding:20px; background:var(--surface); border:1px solid var(--line); }}
.detail img {{ display:block; width:100%; height:auto; }}
figcaption {{ margin-top:12px; color:var(--muted); font-size:14px; }}
footer {{ margin-top:48px; padding-top:20px; border-top:1px solid var(--line);
  color:var(--muted); font-size:14px; }}
@media print {{ body {{ background:white; }} main {{ width:100%; margin:24px auto; }}
  .detail {{ break-inside:avoid; }} }}
</style>
</head>
<body>
<header>
  <h1>Relation judge pilot — results at a glance</h1>
  <p>Rubric {escape(decisions.rubric_version)} · Analysis policy {escape(decisions.policy.version)}</p>
</header>
<main>
  <p class="lede">The pilot qualified <strong>{escape(", ".join(passed) or "no judge families")}</strong>
  and recommends shells <strong>{escape(", ".join(decisions.admitted_shells))}</strong> with templates
  <strong>{escape(", ".join(decisions.admitted_templates))}</strong> for the full-grid run.</p>
  <div class="decision">
    <div><span>Qualified families</span><strong>{escape(", ".join(passed) or "None")}</strong></div>
    <div><span>Pruned families</span><strong>{escape(", ".join(decisions.pruned_families) or "None")}</strong></div>
    <div><span>Projected cost</span><strong>{escape(_compact_estimate(decisions.projected_grid_cost, money=True))}</strong></div>
    <div><span>Future escalation order</span><strong>{escape(" → ".join(decisions.escalation_order) or "No rankable axes")}</strong></div>
  </div>

  <h2>Decision snapshot</h2>
  <img class="overview" src="{_image_data_uri(next(graph for graph in graphs if graph.name == "results-overview.png"))}"
    alt="Aggregate relation judge pilot results">

  <h2>Evidence</h2>
  <div class="evidence">
    <section><h3>Qualification gate</h3><p>{len(passed)} of {len(qualification)} families passed</p>
      <p class="meaning">Passing requires at least 5/6 correct and correct answers on both mandatory probes. The detailed matrix shows every actual answer against truth.</p></section>
    <section><h3>Data retained</h3><p>{decisions.data_health.clean_votes:,} of
      {decisions.data_health.votes_loaded:,} votes ({clean_rate:.1%})</p>
      <p class="meaning">{escape(_data_interpretation(decisions))}</p></section>
    <section><h3>Repeat noise floor</h3>
      <p>{escape(_compact_estimate(decisions.axis_statistics.noise_floor, percent=True))}</p>
      <p class="meaning">{escape(_noise_interpretation(decisions.axis_statistics.noise_floor, decisions.policy.absolute_flip_ceiling))}</p></section>
    <section><h3>Qualified-panel Krippendorff α</h3>
      <p>{escape(_compact_estimate(decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha))}</p>
      <p class="meaning">Passed families only, across the complete experimental prompt grid.
      On this scale, 0 is chance, 0.667 is tentative, and 0.8 is dependable.
      {escape(_alpha_interpretation(decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha))}</p></section>
    <section><h3>All-candidate Krippendorff α</h3>
      <p>{escape(_compact_estimate(decisions.axis_statistics.agreement.all_candidate_krippendorff_alpha))}</p>
      <p class="meaning">Every candidate family, before qualification.
      {escape(_agreement_comparison(decisions.axis_statistics.agreement.all_candidate_krippendorff_alpha, decisions.axis_statistics.agreement.qualified_panel_krippendorff_alpha))}</p></section>
    <section><h3>Shell sensitivity</h3>
      <p>{escape(_compact_estimate(decisions.floor_error_bar, percent=True))}</p>
      <p class="meaning">How often shell wording changed a stable verdict.
      {escape(_shell_interpretation(decisions.floor_error_bar, decisions.policy.absolute_flip_ceiling))}</p></section>
  </div>

  <h2>What escalation means here</h2>
  <div class="note"><strong>No live escalation workflow ran during the pilot.</strong>
  The pilot measured disagreement yield and marginal cost across experimental axes, then ranked those axes
  to recommend how a future full-grid run should resolve contested cards.</div>

  <h2>Data-health notes</h2>
  <ul>{warning_items}</ul>

  <h2>Detailed visualizations</h2>
  <div class="details">{detail_figures}</div>

  <footer>Intervals use {decisions.policy.bootstrap_resamples:,} card-cluster bootstrap resamples at
  {decisions.policy.ci_level:.0%} confidence. “Unavailable” means the pilot did not support a stable
  estimate; it does not mean zero.</footer>
</main>
</body>
</html>
"""  # noqa: RUF001


def visualize_analysis(analysis_dir: PathLike, out_dir: PathLike) -> VisualizationRunResult:
    """Load analysis decisions and render a deterministic set of PNG graphs."""
    decisions_path = Path(analysis_dir) / "decisions.json"
    decisions = AnalysisDecisions.model_validate_json(decisions_path.read_text(encoding="utf-8"))
    output = Path(out_dir)
    output.mkdir(parents=True, exist_ok=True)

    graph_paths = tuple(output / filename for filename in _GRAPH_FILENAMES)
    plotters = (
        _plot_data_health,
        _plot_qualification,
        _plot_marginals,
        _plot_flip_rates,
        _plot_agreement,
        _plot_cost_and_escalation,
        _plot_card_posteriors,
    )
    for plot, path in zip(plotters, graph_paths, strict=True):
        plot(decisions, path)

    overview_path = output / "results-overview.png"
    _plot_results_overview(decisions, overview_path)
    all_graphs = (*graph_paths, overview_path)
    explainer_path = output / "results-overview.md"
    explainer_path.write_text(_render_results_explainer(decisions), encoding="utf-8")
    pdf_path = output / "results-report.pdf"
    _write_pdf_report((overview_path, *graph_paths), pdf_path)
    html_path = output / "results-report.html"
    html_path.write_text(_render_results_html(decisions, all_graphs), encoding="utf-8")
    return VisualizationRunResult(
        graphs=all_graphs,
        explainer_md=explainer_path,
        report_pdf=pdf_path,
        report_html=html_path,
    )
