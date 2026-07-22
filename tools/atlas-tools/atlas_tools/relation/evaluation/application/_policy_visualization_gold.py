"""Render policy-report gold evidence without conflating unavailable data with zero."""

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.ticker import PercentFormatter

from atlas_tools.relation.evaluation.analysis.api import (
    GoldAgreement,
    PolicyReport,
    PolicyReportWithoutGold,
    PublishedPolicyReport,
)
from atlas_tools.relation.evaluation.application._policy_visualization_plots import (
    _source_footer,
    _title,
    _unavailable,
)
from atlas_tools.relation.evaluation.application._policy_visualization_publish import (
    BLUE,
    GRAY,
    GREEN,
    GRID,
    LIGHT,
    ORANGE,
    PURPLE,
    VERMILLION,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex


def _agreement_panel(ax: Axes, report: PolicyReport) -> None:
    labels = ["Panel"]
    metrics = [report.panel_gold.agreement]
    if report.classifier is not None:
        labels.append("Classifier")
        metrics.append(report.classifier.gold.agreement)
    values = [0.0 if metric.value is None else float(metric.value) for metric in metrics]
    bars = ax.bar(labels, values, color=(BLUE, GREEN)[: len(values)], width=0.56)
    ax.set_ylim(0, 1)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0))
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_title("Placement agreement", loc="left", fontweight="bold")
    ax.spines[["top", "right"]].set_visible(False)
    for bar, metric in zip(bars, metrics, strict=True):
        label = "unavailable" if metric.value is None else f"{metric.value:.1%}"
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.03, label, ha="center")


def _class_panel(ax: Axes, agreement: GoldAgreement) -> None:
    positions = list(range(len(agreement.per_class)))
    width = 0.34
    precision = [float(row.precision.value or 0.0) for row in agreement.per_class]
    recall = [float(row.recall.value or 0.0) for row in agreement.per_class]
    ax.bar(
        [value - width / 2 for value in positions],
        precision,
        width,
        color=PURPLE,
        label="Precision",
    )
    ax.bar([value + width / 2 for value in positions], recall, width, color=ORANGE, label="Recall")
    ax.set_xticks(positions, [row.placement_class.title() for row in agreement.per_class])
    ax.set_ylim(0, 1)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0))
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_title(f"{agreement.source.title()} class metrics", loc="left", fontweight="bold")
    ax.legend(frameon=False, ncol=2)
    ax.spines[["top", "right"]].set_visible(False)


def _calibration_panel(ax: Axes, report: PolicyReport) -> None:
    if report.classifier is None:
        _unavailable(ax, "Calibration unavailable", "No classifier was included in this report.")
        return
    populated = tuple(row for row in report.classifier.calibration if row.count > 0)
    if not populated:
        _unavailable(
            ax, "Calibration unavailable", "The evaluated gold cohort has no placement rows."
        )
        return
    confidence = [
        float(row.mean_confidence.value)
        for row in populated
        if row.mean_confidence.value is not None
    ]
    accuracy = [float(row.accuracy.value) for row in populated if row.accuracy.value is not None]
    sizes = [max(45, row.count * 14) for row in populated]
    ax.plot((0, 1), (0, 1), color=GRAY, linestyle="--", linewidth=1.2)
    ax.scatter(confidence, accuracy, s=sizes, color=BLUE, alpha=0.82, edgecolor="white")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    ax.yaxis.set_major_formatter(PercentFormatter(1.0))
    ax.set_xlabel("Mean confidence")
    ax.set_ylabel("Accuracy")
    ax.set_title("Classifier calibration", loc="left", fontweight="bold")
    ax.grid(color=GRID, linewidth=0.8)
    ax.spines[["top", "right"]].set_visible(False)


def _gate_panel(ax: Axes, report: PolicyReport) -> None:
    gate = report.coincident_gate
    ax.set_facecolor(LIGHT)
    verdict_color = GREEN if gate.verdict == "pass" else VERMILLION
    if gate.verdict == "insufficient-sample":
        verdict_color = ORANGE
    ax.text(0.07, 0.79, "Coincident release gate", fontsize=13, fontweight="bold")
    ax.text(0.07, 0.61, gate.verdict.upper(), fontsize=23, fontweight="bold", color=verdict_color)
    bound = "unavailable" if gate.wilson_lcb is None else f"{gate.wilson_lcb:.1%}"
    ax.text(
        0.07,
        0.39,
        f"Source: {gate.source}\nPredictions: {gate.stratum_size:,}\n"
        f"Wilson LCB: {bound}\nTarget: {gate.precision_target:.1%}\n"
        f"Minimum zero-error sample: {gate.minimum_zero_error_count:,}",
        fontsize=10.5,
        linespacing=1.45,
        va="top",
    )
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)


def plot_gold_evaluation(
    report: PublishedPolicyReport,
    *,
    source_hash: Sha256Hex,
) -> Figure:
    """Plot gold-dependent evidence or an explicit unavailable state."""
    if isinstance(report, PolicyReportWithoutGold):
        fig, ax = plt.subplots(figsize=(12, 6.8))
        _title(fig, "Gold evaluation", "Independent adjudication evidence")
        _unavailable(
            ax,
            "Gold not provided",
            "Panel and classifier agreement, per-class precision and recall, calibration, "
            "judge gold agreement, confusion evidence, and the Coincident release gate "
            "are unavailable.",
        )
        fig.subplots_adjust(left=0.06, right=0.94, top=0.82, bottom=0.1)
        _source_footer(fig, source_hash)
        return fig

    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    _title(
        fig,
        "Gold evaluation",
        f"{report.gold_cards:,} labels; {report.gold_post_exposure:,} post-exposure rows excluded.",
    )
    _agreement_panel(axes[0, 0], report)
    agreement = report.classifier.gold if report.classifier is not None else report.panel_gold
    _class_panel(axes[0, 1], agreement)
    _calibration_panel(axes[1, 0], report)
    _gate_panel(axes[1, 1], report)
    fig.subplots_adjust(left=0.08, right=0.96, top=0.82, bottom=0.08, hspace=0.35, wspace=0.25)
    _source_footer(fig, source_hash)
    return fig
