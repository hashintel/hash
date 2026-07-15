"""Build the policy-report executive overview figure."""

from textwrap import fill

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.patches import FancyBboxPatch

from atlas_tools.relation.evaluation.analysis.api import PolicyReport, PublishedPolicyReport
from atlas_tools.relation.evaluation.application._policy_visualization_plots import _source_footer
from atlas_tools.relation.evaluation.application._policy_visualization_publish import (
    BLUE,
    GRAY,
    GREEN,
    GRID,
    INK,
    MUTED,
    ORANGE,
    PURPLE,
    VERMILLION,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

_ABSTENTION_WARNING_RATE = 0.05


def _overview_card(
    ax: Axes,
    *,
    heading: str,
    value: str,
    detail: str,
    color: str,
) -> None:
    ax.set_axis_off()
    box = FancyBboxPatch(
        (0.02, 0.04),
        0.96,
        0.9,
        boxstyle="round,pad=0.018,rounding_size=0.025",
        linewidth=1,
        edgecolor=GRID,
        facecolor="white",
        transform=ax.transAxes,
    )
    ax.add_patch(box)
    ax.text(0.08, 0.79, heading.upper(), fontsize=9, fontweight="bold", color=MUTED)
    ax.text(0.08, 0.5, value, fontsize=25, fontweight="bold", color=color)
    ax.text(0.08, 0.18, fill(detail, width=42), fontsize=9.5, color=MUTED, linespacing=1.35)


def plot_overview(
    report: PublishedPolicyReport,
    *,
    source_hash: Sha256Hex,
) -> Figure:
    """Build the executive overview with explicit classifier and gold states."""
    fig = plt.figure(figsize=(14, 8.2), facecolor="white")
    header = fig.add_axes((0, 0.78, 1, 0.22))
    header.set_facecolor(INK)
    header.set_xticks([])
    header.set_yticks([])
    for spine in header.spines.values():
        spine.set_visible(False)
    header.text(
        0.055, 0.62, "Relation policy evaluation", color="white", fontsize=26, fontweight="bold"
    )
    header.text(
        0.055,
        0.29,
        f"Rubric {report.rubric_version} | validated report metadata {source_hash}",
        color="#CDD4DE",
        fontsize=9.5,
    )
    grid = fig.add_gridspec(
        2, 3, left=0.05, right=0.95, bottom=0.08, top=0.72, hspace=0.18, wspace=0.14
    )
    axes = [fig.add_subplot(grid[row, column]) for row in range(2) for column in range(3)]
    economics = report.economics
    classifier_detail = (
        "No classifier evidence was supplied."
        if report.classifier is None
        else f"{report.classifier.predictions:,} held-out predictions at a "
        f"{report.classifier.decision_threshold:.0%} class-probability threshold."
    )
    _overview_card(
        axes[0],
        heading="Coverage",
        value=f"{report.eligible_cards:,}",
        detail="Eligible cards represented in the policy report.",
        color=BLUE,
    )
    _overview_card(
        axes[1],
        heading="Classifier",
        value=report.classifier_state,
        detail=classifier_detail,
        color=GREEN if report.classifier is not None else GRAY,
    )
    gold_available = isinstance(report, PolicyReport)
    gold_detail = (
        f"{report.gold_cards:,} labels; {report.gold_post_exposure:,} post-exposure excluded."
        if gold_available
        else "Agreement, calibration, and release evidence are unavailable."
    )
    _overview_card(
        axes[2],
        heading="Gold",
        value="evaluated" if gold_available else "not provided",
        detail=gold_detail,
        color=GREEN if gold_available else ORANGE,
    )
    average_abstention = sum(
        float(row.abstention_rate.value or 0.0) for row in report.judges
    ) / len(report.judges)
    _overview_card(
        axes[3],
        heading="Judge health",
        value=f"{average_abstention:.1%}",
        detail=f"Mean family abstention across {len(report.judges)} judge families.",
        color=VERMILLION if average_abstention >= _ABSTENTION_WARNING_RATE else GREEN,
    )
    _overview_card(
        axes[4],
        heading="Refinement",
        value=f"{economics.realized_trigger_rate:.1%}",
        detail=(
            f"{economics.refined_cards:,} of {economics.pool_cards:,} cards triggered refinement."
        ),
        color=PURPLE,
    )
    _overview_card(
        axes[5],
        heading="Fresh known cost",
        value=f"${economics.total_known_cost_usd:,.2f}",
        detail=(
            f"{economics.total_votes:,} total votes; "
            f"{economics.review_queue_cards:,} cards in review queue."
        ),
        color=BLUE,
    )
    _source_footer(fig, source_hash)
    return fig
