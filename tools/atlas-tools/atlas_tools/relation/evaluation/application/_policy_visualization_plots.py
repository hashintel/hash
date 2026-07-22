"""Build the five canonical policy-report figures from strict report models."""

from collections.abc import Sequence
from textwrap import fill

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.ticker import PercentFormatter

from atlas_tools.relation.evaluation.analysis.api import PublishedPolicyReport
from atlas_tools.relation.evaluation.application._policy_visualization_publish import (
    BLUE,
    GRAY,
    GREEN,
    GRID,
    INK,
    LIGHT,
    MUTED,
    ORANGE,
    PURPLE,
    VERMILLION,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex


def _family_label(family_id: str) -> str:
    provider, separator, model = family_id.partition("/")
    return f"{provider}/\n{model}" if separator else fill(family_id, width=24)


def _source_footer(fig: Figure, source_hash: Sha256Hex) -> None:
    fig.text(
        0.02,
        0.012,
        f"Source report metadata SHA-256: {source_hash}",
        fontsize=8,
        color=MUTED,
    )


def _title(fig: Figure, heading: str, subtitle: str) -> None:
    fig.suptitle(heading, x=0.04, y=0.965, ha="left", fontsize=21, fontweight="bold")
    fig.text(0.04, 0.91, subtitle, fontsize=10.5, color=MUTED)


def _unavailable(ax: Axes, heading: str, detail: str) -> None:
    ax.set_facecolor(LIGHT)
    ax.text(
        0.5,
        0.58,
        heading,
        transform=ax.transAxes,
        ha="center",
        va="center",
        fontsize=20,
        fontweight="bold",
        color=INK,
    )
    ax.text(
        0.5,
        0.39,
        fill(detail, width=70),
        transform=ax.transAxes,
        ha="center",
        va="center",
        fontsize=11,
        color=MUTED,
        linespacing=1.5,
    )
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)


def plot_classifier_applicability(
    report: PublishedPolicyReport,
    *,
    source_hash: Sha256Hex,
) -> Figure:
    """Plot held-out applicability quantiles without inventing a cutoff."""
    fig, ax = plt.subplots(figsize=(12, 6.8))
    _title(
        fig,
        "Classifier applicability",
        "Thin lines show q05-q95, thick lines q25-q75, and dots the median.",
    )
    classifier = report.classifier
    if classifier is None:
        _unavailable(
            ax,
            "Classifier not provided",
            "Applicability is only available when the validated policy report includes "
            "a classifier.",
        )
    else:
        rows = classifier.applicability
        positions = list(range(len(rows)))
        for position, row in zip(positions, rows, strict=True):
            ax.plot((row.q05, row.q95), (position, position), color=GRAY, linewidth=2)
            ax.plot((row.q25, row.q75), (position, position), color=BLUE, linewidth=8)
            ax.scatter(row.q50, position, s=72, color=INK, zorder=3, edgecolor="white")
            ax.text(
                min(float(row.q95) + 0.025, 0.97),
                position,
                f"n={row.cards:,}",
                va="center",
                fontsize=9,
                color=MUTED,
            )
        ax.set_yticks(positions, [f"{row.producer}  " for row in rows])
        ax.set_xlim(0, 1)
        ax.set_xlabel("Held-out applicability")
        ax.xaxis.set_major_formatter(PercentFormatter(1.0))
        ax.grid(axis="x", color=GRID, linewidth=0.8)
        ax.invert_yaxis()
        ax.spines[["top", "right", "left"]].set_visible(False)
        ax.tick_params(axis="y", length=0)
        ax.text(
            0,
            -0.18,
            f"{classifier.predictions:,} predictions; decision threshold "
            f"{classifier.decision_threshold:.1%} applies to calibrated class probability, "
            "not applicability.",
            transform=ax.transAxes,
            fontsize=9.5,
            color=MUTED,
        )
    fig.subplots_adjust(left=0.21, right=0.96, top=0.82, bottom=0.18)
    _source_footer(fig, source_hash)
    return fig


def _grouped_rate_bars(
    ax: Axes,
    labels: Sequence[str],
    values: Sequence[Sequence[float]],
    names: Sequence[str],
    colors: Sequence[str],
) -> None:
    positions = list(range(len(labels)))
    width = 0.22
    offsets = tuple((index - (len(values) - 1) / 2) * width for index in range(len(values)))
    for series, name, color, offset in zip(values, names, colors, offsets, strict=True):
        ax.barh(
            [position + offset for position in positions],
            series,
            height=width * 0.82,
            color=color,
            label=name,
        )
    ax.set_yticks(positions, labels)
    ax.set_xlim(0, 1)
    ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.invert_yaxis()
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(axis="y", length=0)


def plot_judge_health(
    report: PublishedPolicyReport,
    *,
    source_hash: Sha256Hex,
) -> Figure:
    """Plot response validity and median latency for every judge family."""
    fig, (rates, latency) = plt.subplots(
        1,
        2,
        figsize=(14, 7.4),
        gridspec_kw={"width_ratios": (1.9, 1)},
    )
    _title(
        fig,
        "Judge health",
        "Operational evidence from every durable vote; gold agreement is intentionally separate.",
    )
    labels = tuple(_family_label(row.family_id) for row in report.judges)
    abstention = tuple(float(row.abstention_rate.value or 0.0) for row in report.judges)
    repairs = tuple(float(row.parse_repair_rate.value or 0.0) for row in report.judges)
    compliance = tuple(float(row.initial_schema_compliance.value or 0.0) for row in report.judges)
    _grouped_rate_bars(
        rates,
        labels,
        (abstention, repairs, compliance),
        ("Abstention", "Parse repair", "Initial schema compliance"),
        (VERMILLION, ORANGE, GREEN),
    )
    rates.set_title("Response validity", loc="left", fontweight="bold")
    rates.legend(frameon=False, loc="lower center", bbox_to_anchor=(0.5, -0.24), ncol=3)

    positions = list(range(len(report.judges)))
    latencies = tuple(float(row.median_latency_seconds.value or 0.0) for row in report.judges)
    bars = latency.barh(positions, latencies, color=BLUE, alpha=0.88, height=0.58)
    latency.set_yticks(positions, ["" for _ in positions])
    latency.invert_yaxis()
    latency.set_xlabel("Median latency (seconds)")
    latency.set_title("Latency", loc="left", fontweight="bold")
    latency.grid(axis="x", color=GRID, linewidth=0.8)
    latency.spines[["top", "right", "left"]].set_visible(False)
    latency.tick_params(axis="y", length=0)
    for bar, value in zip(bars, latencies, strict=True):
        latency.text(
            bar.get_width(),
            bar.get_y() + bar.get_height() / 2,
            f"  {value:.1f}s",
            va="center",
            fontsize=9,
            color=MUTED,
        )
    fig.subplots_adjust(left=0.2, right=0.96, top=0.82, bottom=0.2, wspace=0.16)
    _source_footer(fig, source_hash)
    return fig


def plot_vote_economics(
    report: PublishedPolicyReport,
    *,
    source_hash: Sha256Hex,
) -> Figure:
    """Plot reconciled vote sources and known fresh costs by family."""
    economics = report.economics
    fig, ax = plt.subplots(figsize=(13, 7.4))
    _title(
        fig,
        "Vote economics",
        f"{economics.total_votes:,} votes; "
        f"${economics.total_known_cost_usd:,.2f} fresh known cost; "
        f"{economics.refined_cards:,}/{economics.pool_cards:,} cards refined "
        f"({economics.realized_trigger_rate:.1%}).",
    )
    rows = economics.by_family
    positions = list(range(len(rows)))
    imported = tuple(row.imported_votes for row in rows)
    baseline = tuple(row.fresh_baseline_votes for row in rows)
    refinement = tuple(row.refinement_votes for row in rows)
    ax.barh(positions, imported, color=GRAY, label="Imported pilot")
    ax.barh(positions, baseline, left=imported, color=BLUE, label="Fresh baseline")
    left = tuple(first + second for first, second in zip(imported, baseline, strict=True))
    ax.barh(positions, refinement, left=left, color=PURPLE, label="Refinement")
    ax.set_yticks(positions, [_family_label(row.family_id) for row in rows])
    ax.invert_yaxis()
    ax.set_xlabel("Durable logical votes")
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.tick_params(axis="y", length=0)
    for position, row in zip(positions, rows, strict=True):
        ax.text(
            row.total_votes,
            position,
            f"  {row.total_votes:,} | ${row.known_cost_usd:,.2f}",
            va="center",
            fontsize=9,
            color=MUTED,
        )
    ax.legend(frameon=False, loc="lower center", bbox_to_anchor=(0.5, 1.015), ncol=3)
    ax.text(
        0,
        -0.18,
        f"Coincident review queue: {economics.review_queue_cards:,} cards. "
        "Known cost excludes imported pilot votes and any unavailable billing evidence.",
        transform=ax.transAxes,
        fontsize=9.5,
        color=MUTED,
    )
    fig.subplots_adjust(left=0.2, right=0.9, top=0.78, bottom=0.2)
    _source_footer(fig, source_hash)
    return fig
