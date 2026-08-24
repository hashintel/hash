"""Render source-bound pilot decision reports without weakening analysis types.

This application boundary owns Matplotlib and filesystem effects. It consumes
only the strict pilot decision artifact, selects a compact set of decision
plots, publishes every file atomically, and records the exact decision-file
digest in each output.
"""

import base64
import hashlib
import os
import stat
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import partial
from html import escape
from pathlib import Path
from textwrap import fill
from types import MappingProxyType

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
import trio
from matplotlib.axes import Axes
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.colors import ListedColormap
from matplotlib.figure import Figure
from matplotlib.patches import Patch
from matplotlib.ticker import PercentFormatter

from atlas_tools.relation.evaluation.analysis.api import BundleQualification, RateEstimate
from atlas_tools.relation.evaluation.application.pilot_reporting import (
    LoadedPilotDecisions,
    PilotDecisionArtifact,
    load_pilot_decisions,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

_DETAIL_GRAPHS = (
    "data-health.png",
    "qualification.png",
    "stability-admissions.png",
    "effort-economics.png",
)
_OVERVIEW_GRAPH = "results-overview.png"
_MARKDOWN_REPORT = "results-overview.md"
_PDF_REPORT = "results-report.pdf"
_HTML_REPORT = "results-report.html"
_GRAPH_DESCRIPTIONS: Mapping[str, str] = MappingProxyType(
    {
        "data-health.png": (
            "Missing coverage, routing violations, and abstentions by judge family"
        ),
        "qualification.png": (
            "Qualification scores and answer-level holdout evidence by judge family"
        ),
        "stability-admissions.png": (
            "Family, repeat, shell, and framing instability with confidence intervals"
        ),
        "effort-economics.png": (
            "Effort-arm holdout evidence and projected production cost by judge family"
        ),
        "results-overview.png": "Production decision overview and key pilot evidence",
    }
)

_INK = "#172033"
_MUTED = "#596273"
_GRID = "#D7DCE2"
_BLUE = "#0072B2"
_GREEN = "#009E73"
_ORANGE = "#E69F00"
_VERMILLION = "#D55E00"
_PURPLE = "#CC79A7"
_GRAY = "#8A94A6"
_LIGHT = "#F3F5F7"
_FIXED_PDF_DATE = datetime(2000, 1, 1, tzinfo=UTC)


@dataclass(frozen=True, slots=True, kw_only=True)
class PilotVisualizationRun:
    """Return exact paths and identities for one complete visualization run."""

    graphs: tuple[Path, ...]
    explainer_md: Path
    report_pdf: Path
    report_html: Path
    decisions_hash: Sha256Hex
    content_hashes: Mapping[str, Sha256Hex]

    def __post_init__(self) -> None:
        expected_graphs = (*_DETAIL_GRAPHS, _OVERVIEW_GRAPH)
        if tuple(path.name for path in self.graphs) != expected_graphs:
            raise ValueError("visualization graphs do not use the canonical order")
        outputs = (*self.graphs, self.explainer_md, self.report_pdf, self.report_html)
        if set(self.content_hashes) != {path.name for path in outputs}:
            raise ValueError("visualization content hashes do not cover every output")


@dataclass(frozen=True, slots=True, kw_only=True)
class _FamilyHealth:
    family_id: str
    missing_rate: float
    routing_rate: float
    abstention_rate: float


def _sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ensure_directory(directory: Path) -> None:
    missing: list[Path] = []
    current = directory
    while True:
        try:
            information = current.stat()
        except FileNotFoundError:
            missing.append(current)
            parent = current.parent
            if parent == current:
                raise OSError(f"cannot find an existing ancestor for {directory}") from None
            current = parent
            continue
        if not stat.S_ISDIR(information.st_mode):
            raise ValueError(f"visualization parent is not a directory: {current}")
        break
    for path in reversed(missing):
        try:
            path.mkdir()
        except FileExistsError:
            information = path.stat()
            if not stat.S_ISDIR(information.st_mode):
                raise ValueError(f"visualization parent is not a directory: {path}") from None
        _sync_directory(path.parent)


def _atomic_generate(path: Path, writer: Callable[[Path], None]) -> None:
    _ensure_directory(path.parent)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
    try:
        writer(temporary)
        with temporary.open("rb") as generated:
            os.fsync(generated.fileno())
        temporary.replace(path)
        _sync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _atomic_bytes(path: Path, payload: bytes) -> None:
    def write(temporary: Path) -> None:
        with temporary.open("wb") as output:
            written = output.write(payload)
            if written != len(payload):
                raise OSError(
                    f"short visualization write to {path}: {written} of {len(payload)} bytes"
                )

    _atomic_generate(path, write)


def _source_metadata(source_hash: Sha256Hex) -> dict[str, str]:
    return {
        "Description": f"source-sha256={source_hash}",
        "Software": "atlas-tools relation evaluation",
    }


def _save_figure(fig: Figure, path: Path, *, source_hash: Sha256Hex) -> None:
    def write(temporary: Path) -> None:
        fig.savefig(
            temporary,
            format="png",
            dpi=144,
            bbox_inches="tight",
            facecolor="white",
            metadata=_source_metadata(source_hash),
        )

    try:
        _atomic_generate(path, write)
    finally:
        plt.close(fig)


def _family_label(family_id: str) -> str:
    return family_id.replace("/", "/\n", 1)


def _rate(value: RateEstimate) -> str:
    if value.estimate is None:
        return "undefined"
    if value.lower is None or value.upper is None:
        return f"{value.estimate:.2%} (CI undefined)"
    return f"{value.estimate:.2%} ({value.lower:.2%}-{value.upper:.2%})"


def _money(value: float | None) -> str:
    return "unknown" if value is None else f"${value:,.2f}"


def _family_health(decisions: PilotDecisionArtifact) -> tuple[_FamilyHealth, ...]:
    health = decisions.analysis.data_health
    family_ids = tuple(row.family_id for row in decisions.analysis.qualification)
    result: list[_FamilyHealth] = []
    for family_id in family_ids:
        coverage = tuple(row for row in health.coverage if row.family_id == family_id)
        routing = tuple(row for row in health.routing if row.family_id == family_id)
        compatibility = tuple(row for row in health.family_bundle if row.family_id == family_id)
        expected = sum(row.expected for row in coverage)
        observed = sum(row.observed for row in routing)
        responses = sum(row.responses for row in compatibility)
        result.append(
            _FamilyHealth(
                family_id=family_id,
                missing_rate=(sum(row.missing for row in coverage) / expected),
                routing_rate=(
                    sum(row.violations for row in routing) / observed if observed else 0.0
                ),
                abstention_rate=(
                    sum(row.abstentions for row in compatibility) / responses if responses else 0.0
                ),
            )
        )
    return tuple(result)


def _labeled_bars(
    ax: Axes,
    *,
    labels: Sequence[str],
    values: Sequence[float],
    color: str,
    threshold: float,
    title: str,
) -> None:
    positions = list(range(len(labels)))
    bars = ax.barh(positions, values, color=color, alpha=0.88, height=0.62)
    ax.axvline(
        threshold,
        color=_INK,
        linestyle="--",
        linewidth=1.2,
        label=f"limit {threshold:.1%}",
    )
    ax.set_yticks(positions, labels)
    ax.invert_yaxis()
    upper = max((threshold, *values), default=threshold)
    ax.set_xlim(0.0, min(1.0, max(0.01, upper * 1.35)))
    ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    ax.grid(axis="x", color=_GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    ax.set_title(title)
    ax.legend(loc="lower right", frameon=False)
    for bar, value in zip(bars, values, strict=True):
        ax.text(
            bar.get_width() + max(upper * 0.025, 0.0002),
            bar.get_y() + bar.get_height() / 2,
            f"{value:.2%}",
            va="center",
            fontsize=8,
        )


def _plot_data_health(
    decisions: PilotDecisionArtifact,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    rows = _family_health(decisions)
    labels = tuple(_family_label(row.family_id) for row in rows)
    policy = decisions.policy
    fig = plt.figure(figsize=(16, max(6.0, len(rows) * 0.72)), layout="constrained")
    axes = (
        fig.add_subplot(1, 3, 1),
        fig.add_subplot(1, 3, 2),
        fig.add_subplot(1, 3, 3),
    )
    _labeled_bars(
        axes[0],
        labels=labels,
        values=tuple(row.missing_rate for row in rows),
        color=_BLUE,
        threshold=policy.stream_missing_rerun_rate,
        title="Missing expected votes",
    )
    _labeled_bars(
        axes[1],
        labels=labels,
        values=tuple(row.routing_rate for row in rows),
        color=_ORANGE,
        threshold=policy.routing_rerun_rate,
        title="Route-pin violations",
    )
    _labeled_bars(
        axes[2],
        labels=labels,
        values=tuple(row.abstention_rate for row in rows),
        color=_PURPLE,
        threshold=policy.abstention_flag_rate,
        title="Abstentions",
    )
    health = decisions.analysis.data_health
    fig.suptitle(
        f"Pilot data health: {health.clean_votes:,} of {health.votes_loaded:,} votes retained",
        fontsize=16,
        fontweight="bold",
    )
    _save_figure(fig, path, source_hash=source_hash)


def _qualification_bundle(
    decisions: PilotDecisionArtifact,
    family_index: int,
) -> BundleQualification:
    family = decisions.analysis.qualification[family_index]
    return next(bundle for bundle in family.bundles if bundle.bundle_id == "S1xF1")


def _plot_qualification(
    decisions: PilotDecisionArtifact,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    families = decisions.analysis.qualification
    labels = tuple(_family_label(row.family_id) for row in families)
    bundles = tuple(_qualification_bundle(decisions, index) for index in range(len(families)))
    holdouts = bundles[0].holdouts
    states: list[list[int]] = []
    answers: list[list[str]] = []
    for bundle in bundles:
        state_row: list[int] = []
        answer_row: list[str] = []
        for holdout in bundle.holdouts:
            answer_row.append(holdout.verdict or "missing")
            if holdout.verdict is None:
                state_row.append(0)
            elif holdout.verdict == holdout.accepted_verdicts[0]:
                state_row.append(3)
            elif holdout.correct:
                state_row.append(2)
            else:
                state_row.append(1)
        states.append(state_row)
        answers.append(answer_row)

    fig = plt.figure(figsize=(17, max(6.0, len(families) * 0.72)), layout="constrained")
    grid = fig.add_gridspec(1, 2, width_ratios=(1.0, 2.4))
    score_ax = fig.add_subplot(grid[0, 0])
    answer_ax = fig.add_subplot(grid[0, 1])
    positions = list(range(len(families)))
    scores = tuple(row.correct_count / row.total_count for row in families)
    bars = score_ax.barh(
        positions,
        scores,
        color=tuple(_GREEN if row.passed else _VERMILLION for row in families),
        height=0.62,
    )
    score_ax.set_yticks(positions, labels)
    score_ax.invert_yaxis()
    score_ax.set_xlim(0.0, 1.18)
    score_ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    score_ax.grid(axis="x", color=_GRID, linewidth=0.7)
    score_ax.set_axisbelow(True)
    score_ax.set_title("S1xF1 qualification score")
    for bar, family in zip(bars, families, strict=True):
        decision = "QUALIFY" if family.passed else "PRUNE"
        score_ax.text(
            bar.get_width() + 0.02,
            bar.get_y() + bar.get_height() / 2,
            f"{family.correct_count}/{family.total_count} {decision}",
            va="center",
            fontsize=8,
            fontweight="bold",
        )

    answer_ax.imshow(
        states,
        cmap=ListedColormap((_LIGHT, "#F4B8AE", "#F6D98B", "#A8DCC8")),
        vmin=-0.5,
        vmax=3.5,
        aspect="auto",
    )
    holdout_labels = tuple(
        f"{row.relation_id}{'*' if row.mandatory_probe else ''}\n{row.accepted_verdicts[0]}"
        for row in holdouts
    )
    answer_ax.set_xticks(range(len(holdouts)), holdout_labels)
    answer_ax.set_yticks(positions, labels)
    answer_ax.tick_params(top=True, labeltop=True, bottom=False, labelbottom=False)
    answer_ax.set_title("Observed holdout verdict (* mandatory probe)", pad=36)
    for row_index, row in enumerate(answers):
        for column_index, answer in enumerate(row):
            answer_ax.text(
                column_index,
                row_index,
                answer,
                ha="center",
                va="center",
                fontsize=7,
                color=_INK,
            )
    answer_ax.legend(
        handles=(
            Patch(facecolor="#A8DCC8", label="canonical"),
            Patch(facecolor="#F6D98B", label="accepted alternate"),
            Patch(facecolor="#F4B8AE", label="wrong"),
            Patch(facecolor=_LIGHT, label="missing"),
        ),
        loc="lower center",
        bbox_to_anchor=(0.5, -0.16),
        ncols=4,
        frameon=False,
    )
    fig.suptitle("Judge-family qualification evidence", fontsize=16, fontweight="bold")
    _save_figure(fig, path, source_hash=source_hash)


def _interval(value: RateEstimate) -> tuple[float, float] | None:
    if value.estimate is None or value.lower is None or value.upper is None:
        return None
    return value.estimate - value.lower, value.upper - value.estimate


def _plot_stability(
    decisions: PilotDecisionArtifact,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    analysis = decisions.analysis
    labels = ["Family disagreement", "Repeat instability"]
    rates = [analysis.family_stability, analysis.repeat_stability.rate]
    decisions_text = ["reference", "reference"]
    admitted = [True, True]
    for row in analysis.admissions:
        labels.append(f"{row.axis}: {row.level}")
        rates.append(row.stability.candidate)
        decisions_text.append("ADMIT" if row.admitted else "REJECT")
        admitted.append(row.admitted)

    fig, ax = plt.subplots(figsize=(12, 6.5), layout="constrained")
    positions = list(range(len(labels)))
    for position, rate, is_admitted, decision in zip(
        positions,
        rates,
        admitted,
        decisions_text,
        strict=True,
    ):
        if rate.estimate is None:
            ax.text(0.0, position, f"undefined {decision}", va="center", color=_MUTED)
            continue
        error = _interval(rate)
        color = _BLUE if decision == "reference" else (_GREEN if is_admitted else _VERMILLION)
        marker = "o" if decision == "reference" else ("s" if is_admitted else "X")
        ax.errorbar(
            rate.estimate,
            position,
            xerr=([error[0]], [error[1]]) if error is not None else None,
            fmt=marker,
            color=color,
            capsize=5,
            markersize=8,
            linewidth=1.7,
        )
        ax.text(rate.estimate + 0.003, position, decision, va="center", fontsize=8)
    ceiling = decisions.policy.absolute_flip_ceiling
    relative = (
        analysis.family_stability.estimate * decisions.policy.relative_flip_factor
        if analysis.family_stability.estimate is not None
        else None
    )
    ax.axvline(
        ceiling,
        color=_INK,
        linestyle="--",
        linewidth=1.2,
        label=f"absolute ceiling {ceiling:.1%}",
    )
    if relative is not None:
        ax.axvline(
            relative,
            color=_PURPLE,
            linestyle=":",
            linewidth=1.4,
            label=f"family-relative point threshold {relative:.1%}",
        )
    upper_values = tuple(rate.upper or rate.estimate or 0.0 for rate in rates)
    ax.set_xlim(0.0, max(ceiling, *upper_values) * 1.25)
    ax.set_yticks(positions, labels)
    ax.invert_yaxis()
    ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    ax.grid(axis="x", color=_GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    ax.set_xlabel("Verdict flip or disagreement rate")
    ax.set_title(
        "Stability and prompt-axis admissions\nIntervals are card-cluster bootstrap intervals"
    )
    ax.legend(frameon=False, loc="lower right")
    _save_figure(fig, path, source_hash=source_hash)


def _plot_effort_economics(
    decisions: PilotDecisionArtifact,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    analysis = decisions.analysis
    effort = analysis.effort
    economics = analysis.economics.families
    labels = tuple(_family_label(row.family_id) for row in effort)
    positions = list(range(len(effort)))
    total_holdouts = len(decisions.policy.holdouts)

    fig = plt.figure(figsize=(16, max(6.0, len(effort) * 0.8)), layout="constrained")
    grid = fig.add_gridspec(1, 2, width_ratios=(1.35, 1.0))
    effort_ax = fig.add_subplot(grid[0, 0])
    cost_ax = fig.add_subplot(grid[0, 1])
    baseline = tuple(row.baseline_holdout_correct / total_holdouts for row in effort)
    candidates = tuple(
        row.candidate.holdout.correct / total_holdouts if row.candidate is not None else 0.0
        for row in effort
    )
    effort_ax.barh(
        [position - 0.18 for position in positions],
        baseline,
        height=0.32,
        color=_BLUE,
        label="baseline holdout correctness",
    )
    effort_ax.barh(
        [position + 0.18 for position in positions],
        candidates,
        height=0.32,
        color=_ORANGE,
        hatch="//",
        label="candidate holdout correctness",
    )
    effort_ax.set_yticks(positions, labels)
    effort_ax.invert_yaxis()
    effort_ax.set_xlim(0.0, 1.32)
    effort_ax.xaxis.set_major_formatter(PercentFormatter(1.0))
    effort_ax.grid(axis="x", color=_GRID, linewidth=0.7)
    effort_ax.set_axisbelow(True)
    effort_ax.set_title("Higher-effort evidence and selected policy")
    effort_ax.legend(
        frameon=False,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.08),
        ncols=2,
    )
    for position, row in zip(positions, effort, strict=True):
        candidate = row.candidate
        evidence = (
            "no candidate arm"
            if candidate is None
            else f"rescues {candidate.holdout.rescues}, regressions {candidate.holdout.regressions}"
        )
        effort_ax.text(
            1.02,
            position,
            f"select {row.selected_effort}; {evidence}",
            va="center",
            fontsize=8,
        )

    costs = tuple(row.projected_cost_usd or 0.0 for row in economics)
    cost_bars = cost_ax.barh(
        positions,
        costs,
        color=tuple(_GREEN if row.projected_cost_usd is not None else _GRAY for row in economics),
        height=0.62,
    )
    cost_ax.set_yticks(positions, labels)
    cost_ax.invert_yaxis()
    cost_ax.grid(axis="x", color=_GRID, linewidth=0.7)
    cost_ax.set_axisbelow(True)
    cost_ax.set_xlabel("Projected production cost (USD)")
    cost_ax.set_title(f"Projected family cost; total {_money(decisions.projected_grid_cost_usd)}")
    upper = max(costs, default=0.0)
    cost_ax.set_xlim(0.0, max(1.0, upper * 1.28))
    for bar, row in zip(cost_bars, economics, strict=True):
        cost_ax.text(
            bar.get_width() + max(upper * 0.02, 0.2),
            bar.get_y() + bar.get_height() / 2,
            _money(row.projected_cost_usd),
            va="center",
            fontsize=8,
        )
    fig.suptitle("Reasoning effort and projected economics", fontsize=16, fontweight="bold")
    _save_figure(fig, path, source_hash=source_hash)


def _panel(ax: Axes, title: str) -> None:
    ax.set_facecolor("white")
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_color(_GRID)
    ax.text(0.04, 0.92, title, transform=ax.transAxes, fontsize=13, fontweight="bold")


def _wrapped(values: Sequence[str], *, width: int = 42) -> str:
    if not values:
        return "none"
    return fill(
        ", ".join(values),
        width=width,
        break_long_words=False,
        break_on_hyphens=False,
    )


def _plot_overview(
    decisions: PilotDecisionArtifact,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    analysis = decisions.analysis
    health = analysis.data_health
    clean_rate = health.clean_votes / health.votes_loaded if health.votes_loaded else 0.0
    fig = plt.figure(figsize=(16, 9), facecolor=_LIGHT)
    header = fig.add_axes((0.0, 0.84, 1.0, 0.16))
    header.set_facecolor(_INK)
    header.set_xticks([])
    header.set_yticks([])
    for spine in header.spines.values():
        spine.set_visible(False)
    header.text(
        0.045,
        0.62,
        "Relation judge pilot - production decision",
        color="white",
        fontsize=25,
        fontweight="bold",
        va="center",
    )
    header.text(
        0.045,
        0.24,
        f"Strict decision artifact schema {decisions.schema_version}",
        color="#CDD4DE",
        fontsize=11,
        va="center",
    )
    qualification = fig.add_axes((0.05, 0.48, 0.42, 0.27))
    configuration = fig.add_axes((0.53, 0.48, 0.42, 0.27))
    stability = fig.add_axes((0.05, 0.12, 0.42, 0.27))
    economics = fig.add_axes((0.53, 0.12, 0.42, 0.27))
    for ax, title in (
        (qualification, "Qualification"),
        (configuration, "Production configuration"),
        (stability, "Reliability and data health"),
        (economics, "Effort and projected economics"),
    ):
        _panel(ax, title)

    qualification.text(
        0.05,
        0.66,
        f"{len(decisions.qualified_families)} of {len(analysis.qualification)} families qualify",
        fontsize=18,
        fontweight="bold",
        color=_GREEN,
    )
    qualification.text(
        0.05,
        0.46,
        "Qualified:\n" + _wrapped(decisions.qualified_families, width=40),
        fontsize=8.5,
        va="top",
    )
    qualification.text(
        0.56,
        0.46,
        "Pruned:\n" + _wrapped(decisions.pruned_families, width=34),
        fontsize=8.5,
        va="top",
        color=_MUTED,
    )
    configuration.text(
        0.05,
        0.68,
        f"Shells: {', '.join(decisions.admitted_shells)}\n"
        f"Framings: {', '.join(decisions.admitted_framings)}",
        fontsize=16,
        fontweight="bold",
        linespacing=1.5,
    )
    configuration.text(
        0.05,
        0.40,
        "Selected effort:\n"
        + "\n".join(
            f"{row.family_id}: {row.selected_effort}" for row in decisions.selected_efforts
        ),
        fontsize=8,
        va="top",
    )
    stability.text(
        0.05,
        0.62,
        f"Clean votes: {health.clean_votes:,}/{health.votes_loaded:,} ({clean_rate:.2%})\n"
        f"Family disagreement: {_rate(analysis.family_stability)}\n"
        f"Repeat instability: {_rate(analysis.repeat_stability.rate)}",
        fontsize=12,
        linespacing=1.55,
    )
    stability.text(
        0.05,
        0.17,
        f"Axis admissions: {sum(row.admitted for row in analysis.admissions)}/"
        f"{len(analysis.admissions)}; data-health warnings: {len(health.warnings)}",
        fontsize=10,
        color=_MUTED,
    )
    economics.text(
        0.05,
        0.64,
        _money(decisions.projected_grid_cost_usd),
        fontsize=25,
        fontweight="bold",
        color=_BLUE,
    )
    economics.text(0.05, 0.50, "Projected full-grid cost", fontsize=10, color=_MUTED)
    economics.text(
        0.05,
        0.27,
        f"Admitted bundles: {', '.join(analysis.economics.admitted_bundles)}\n"
        f"Calls per family: {analysis.economics.projected_calls:,}",
        fontsize=11,
        linespacing=1.5,
    )
    fig.text(
        0.05,
        0.045,
        f"Source decisions SHA-256: {source_hash}",
        fontsize=8.5,
        color=_MUTED,
    )
    _save_figure(fig, path, source_hash=source_hash)


def _render_markdown(
    decisions: PilotDecisionArtifact,
    *,
    source_hash: Sha256Hex,
) -> str:
    analysis = decisions.analysis
    health = analysis.data_health
    lines = [
        "# Relation judge pilot - results overview",
        "",
        f"Source decisions SHA-256: `{source_hash}`.",
        "",
        "## Production decision",
        "",
        f"- Qualified families: {', '.join(decisions.qualified_families) or 'none'}.",
        f"- Pruned families: {', '.join(decisions.pruned_families) or 'none'}.",
        f"- Admitted shells: {', '.join(decisions.admitted_shells)}.",
        f"- Admitted framings: {', '.join(decisions.admitted_framings)}.",
        f"- Projected full-grid cost: {_money(decisions.projected_grid_cost_usd)}.",
        "",
        "## Evidence",
        "",
        f"- Clean votes: {health.clean_votes}/{health.votes_loaded}.",
        f"- Family disagreement: {_rate(analysis.family_stability)}.",
        f"- Repeat instability: {_rate(analysis.repeat_stability.rate)}.",
        f"- Repeat pair coverage: {analysis.repeat_stability.matched_pairs}/"
        f"{analysis.repeat_stability.expected_pairs}.",
        "",
        "### Prompt-axis admissions",
        "",
    ]
    lines.extend(
        f"- {row.axis} {row.level}: {'ADMIT' if row.admitted else 'REJECT'}; "
        f"candidate {_rate(row.stability.candidate)}; {'; '.join(row.reasons)}."
        for row in analysis.admissions
    )
    lines.extend(["", "### Effort policy", ""])
    lines.extend(
        f"- {row.family_id}: select {row.selected_effort}; {'; '.join(row.reasons)}."
        for row in analysis.effort
    )
    lines.extend(["", "## Data-health findings", ""])
    lines.extend(f"- {warning}." for warning in health.warnings)
    if not health.warnings:
        lines.append("- No data-health warnings.")
    lines.extend(
        [
            "",
            "## Graphs",
            "",
            *(
                f"- `{name}`: {_GRAPH_DESCRIPTIONS[name]}."
                for name in (*_DETAIL_GRAPHS, _OVERVIEW_GRAPH)
            ),
            "",
            "Rates use card-cluster bootstrap intervals where defined. An undefined "
            "estimate is missing evidence, not zero.",
            "",
        ]
    )
    return "\n".join(lines)


def _image_data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _render_html(
    decisions: PilotDecisionArtifact,
    graphs: Sequence[Path],
    *,
    source_hash: Sha256Hex,
) -> str:
    figures = "\n".join(
        f'<figure><img src="{_image_data_uri(path)}" '
        f'alt="{escape(_GRAPH_DESCRIPTIONS[path.name])}">'
        f"<figcaption>{escape(_GRAPH_DESCRIPTIONS[path.name])}</figcaption></figure>"
        for path in graphs
    )
    warnings = (
        "".join(
            f"<li>{escape(warning)}</li>" for warning in decisions.analysis.data_health.warnings
        )
        or "<li>No data-health warnings.</li>"
    )
    qualified = escape(", ".join(decisions.qualified_families) or "none")
    pruned = escape(", ".join(decisions.pruned_families) or "none")
    shells = escape(", ".join(decisions.admitted_shells))
    framings = escape(", ".join(decisions.admitted_framings))
    projected_cost = escape(_money(decisions.projected_grid_cost_usd))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="ascii">
<meta name="source-sha256" content="{source_hash}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relation judge pilot results</title>
<style>
:root {{ --ink:{_INK}; --muted:{_MUTED}; --line:{_GRID}; --surface:#fff; --bg:{_LIGHT}; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
header {{ padding:44px max(5vw,24px); background:var(--ink); color:white; }}
header h1 {{ margin:0 0 8px; font-size:clamp(30px,4vw,48px); }}
header p {{ margin:0; color:#CDD4DE; overflow-wrap:anywhere; }}
main {{ width:min(1180px,92vw); margin:40px auto 72px; }}
.decision {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:24px; padding:24px 0; border-block:1px solid var(--line); }}
.decision span {{ display:block; color:var(--muted); font-size:14px; }}
.decision strong {{ display:block; margin-top:4px; font-size:18px; }}
figure {{ margin:32px 0; padding:18px; background:var(--surface); border:1px solid var(--line); }}
img {{ display:block; width:100%; height:auto; }}
figcaption {{ margin-top:12px; color:var(--muted); }}
footer {{ margin-top:44px; padding-top:20px; border-top:1px solid var(--line);
  color:var(--muted); overflow-wrap:anywhere; }}
@media print {{ body {{ background:white; }} figure {{ break-inside:avoid; }} }}
</style>
</head>
<body>
<header><h1>Relation judge pilot results</h1><p>Source decisions SHA-256: {source_hash}</p></header>
<main>
<section class="decision">
<div><span>Qualified families</span><strong>{qualified}</strong></div>
<div><span>Pruned families</span><strong>{pruned}</strong></div>
<div><span>Prompt configuration</span><strong>
shells {shells}; framings {framings}</strong></div>
<div><span>Projected full-grid cost</span><strong>{projected_cost}</strong></div>
</section>
<h2>Decision evidence</h2>
{figures}
<h2>Data-health findings</h2><ul>{warnings}</ul>
<footer>Rates use card-cluster bootstrap intervals where defined.
Source decisions SHA-256: {source_hash}.</footer>
</main>
</body>
</html>
"""


def _write_pdf(graphs: Sequence[Path], path: Path, *, source_hash: Sha256Hex) -> None:
    metadata = {
        "Author": "atlas-tools relation evaluation",
        "CreationDate": _FIXED_PDF_DATE,
        "Creator": "atlas-tools relation evaluation",
        "Keywords": f"source-sha256={source_hash}",
        "ModDate": _FIXED_PDF_DATE,
        "Subject": f"Pilot decision evidence; source-sha256={source_hash}",
        "Title": "Relation judge pilot results",
    }

    def write(temporary: Path) -> None:
        with PdfPages(temporary, metadata=metadata) as pdf:
            for graph in graphs:
                image = plt.imread(graph)
                fig = plt.figure(figsize=(16, 9), facecolor="white")
                try:
                    ax = fig.add_axes((0.03, 0.04, 0.94, 0.89))
                    ax.imshow(image)
                    ax.set_axis_off()
                    fig.suptitle(
                        _GRAPH_DESCRIPTIONS[graph.name],
                        fontsize=15,
                        fontweight="bold",
                    )
                    pdf.savefig(fig, bbox_inches="tight", facecolor="white")
                finally:
                    plt.close(fig)

    _atomic_generate(path, write)


def _hash_file(path: Path) -> Sha256Hex:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        while chunk := input_file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_outputs(paths: Sequence[Path], *, source_hash: Sha256Hex) -> None:
    source = source_hash.encode("ascii")
    for path in paths:
        payload = path.read_bytes()
        if source not in payload:
            raise ValueError(f"visualization output does not bind its decision source: {path}")
        if path.suffix in {".md", ".html"} and not payload.isascii():
            raise ValueError(f"visualization prose is not ASCII: {path}")


def _visualize(
    loaded: LoadedPilotDecisions,
    output_directory: Path,
) -> PilotVisualizationRun:
    decisions = loaded.decisions
    source_hash = loaded.content_hash
    graph_paths = tuple(output_directory / name for name in (*_DETAIL_GRAPHS, _OVERVIEW_GRAPH))
    with mpl.rc_context():
        mpl.rcParams["axes.edgecolor"] = _GRID
        mpl.rcParams["axes.labelcolor"] = _INK
        mpl.rcParams["axes.titlecolor"] = _INK
        mpl.rcParams["figure.facecolor"] = "white"
        mpl.rcParams["font.family"] = "DejaVu Sans"
        mpl.rcParams["font.size"] = 10
        mpl.rcParams["savefig.facecolor"] = "white"
        mpl.rcParams["text.color"] = _INK
        mpl.rcParams["xtick.color"] = _MUTED
        mpl.rcParams["ytick.color"] = _MUTED
        _plot_data_health(decisions, graph_paths[0], source_hash=source_hash)
        _plot_qualification(decisions, graph_paths[1], source_hash=source_hash)
        _plot_stability(decisions, graph_paths[2], source_hash=source_hash)
        _plot_effort_economics(decisions, graph_paths[3], source_hash=source_hash)
        _plot_overview(decisions, graph_paths[4], source_hash=source_hash)

        markdown_path = output_directory / _MARKDOWN_REPORT
        markdown = _render_markdown(decisions, source_hash=source_hash)
        _atomic_bytes(markdown_path, markdown.encode("ascii"))
        pdf_path = output_directory / _PDF_REPORT
        _write_pdf((graph_paths[4], *graph_paths[:4]), pdf_path, source_hash=source_hash)
        html_path = output_directory / _HTML_REPORT
        html = _render_html(
            decisions,
            (graph_paths[4], *graph_paths[:4]),
            source_hash=source_hash,
        )
        _atomic_bytes(html_path, html.encode("ascii"))

    outputs = (*graph_paths, markdown_path, pdf_path, html_path)
    _verify_outputs(outputs, source_hash=source_hash)
    content_hashes = MappingProxyType({path.name: _hash_file(path) for path in outputs})
    return PilotVisualizationRun(
        graphs=graph_paths,
        explainer_md=markdown_path,
        report_pdf=pdf_path,
        report_html=html_path,
        decisions_hash=source_hash,
        content_hashes=content_hashes,
    )


def visualize_analysis(
    analysis_directory: Path,
    output_directory: Path,
) -> PilotVisualizationRun:
    """Render one strict pilot decision artifact for synchronous callers.

    Args:
        analysis_directory: Directory containing `decisions.json`.
        output_directory: Destination for graphs and overview reports.

    Returns:
        Canonically ordered graph paths, report paths, and exact content hashes.

    Raises:
        OSError: An output cannot be written or synchronized.
        ValueError: Decisions or generated source bindings fail validation.

    """
    loaded = load_pilot_decisions(analysis_directory / "decisions.json")
    return _visualize(loaded, output_directory)


async def visualize_analysis_async(
    analysis_directory: Path,
    output_directory: Path,
) -> PilotVisualizationRun:
    """Render pilot decisions without blocking Trio's event loop.

    Matplotlib and all filesystem work run together in one worker thread because
    Matplotlib's global state is not safe to split across concurrent workers.

    Args:
        analysis_directory: Directory containing `decisions.json`.
        output_directory: Destination for graphs and overview reports.

    Returns:
        The same source-bound result as [`visualize_analysis`].

    Raises:
        OSError: An output cannot be written or synchronized.
        ValueError: Decisions or generated source bindings fail validation.

    """
    operation = partial(visualize_analysis, analysis_directory, output_directory)
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
