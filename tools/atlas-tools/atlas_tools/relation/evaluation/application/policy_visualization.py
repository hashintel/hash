"""Render source-bound images and reports from a validated policy report."""

from collections.abc import Mapping
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import matplotlib as mpl
import trio

from atlas_tools.relation.evaluation.application._policy_visualization_gold import (
    plot_gold_evaluation,
)
from atlas_tools.relation.evaluation.application._policy_visualization_overview import (
    plot_overview,
)
from atlas_tools.relation.evaluation.application._policy_visualization_plots import (
    plot_classifier_applicability,
    plot_judge_health,
    plot_vote_economics,
)
from atlas_tools.relation.evaluation.application._policy_visualization_publish import (
    GRAPH_NAMES,
    HTML_REPORT_NAME,
    MARKDOWN_REPORT_NAME,
    PDF_REPORT_NAME,
    hash_outputs,
    save_figure,
    write_html,
    write_markdown,
    write_pdf,
)
from atlas_tools.relation.evaluation.application.policy_report import (
    PolicyReportArtifact,
    load_policy_report_artifact,
    load_policy_report_artifact_async,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex


@dataclass(frozen=True, slots=True, kw_only=True)
class PolicyVisualizationRun:
    """Return exact paths and identities for one policy visualization bundle."""

    graphs: tuple[Path, ...]
    explainer_md: Path
    report_pdf: Path
    report_html: Path
    report_metadata_hash: Sha256Hex
    content_hashes: Mapping[str, Sha256Hex]

    def __post_init__(self) -> None:
        if tuple(path.name for path in self.graphs) != GRAPH_NAMES:
            raise ValueError("policy visualization graphs do not use the canonical order")
        if self.explainer_md.name != MARKDOWN_REPORT_NAME:
            raise ValueError("policy visualization Markdown does not use its canonical name")
        if self.report_pdf.name != PDF_REPORT_NAME:
            raise ValueError("policy visualization PDF does not use its canonical name")
        if self.report_html.name != HTML_REPORT_NAME:
            raise ValueError("policy visualization HTML does not use its canonical name")
        outputs = (*self.graphs, self.explainer_md, self.report_pdf, self.report_html)
        if set(self.content_hashes) != {path.name for path in outputs}:
            raise ValueError("policy visualization hashes do not cover every output")


def _visualize(
    artifact: PolicyReportArtifact,
    output_directory: Path,
) -> PolicyVisualizationRun:
    report = artifact.report
    source_hash = artifact.metadata.metadata_hash
    graph_paths = tuple(output_directory / name for name in GRAPH_NAMES)
    with mpl.rc_context():
        mpl.rcParams["axes.edgecolor"] = "#D7DCE2"
        mpl.rcParams["axes.labelcolor"] = "#172033"
        mpl.rcParams["axes.titlecolor"] = "#172033"
        mpl.rcParams["figure.facecolor"] = "white"
        mpl.rcParams["font.family"] = "DejaVu Sans"
        mpl.rcParams["font.size"] = 10
        mpl.rcParams["savefig.facecolor"] = "white"
        mpl.rcParams["text.color"] = "#172033"
        mpl.rcParams["xtick.color"] = "#596273"
        mpl.rcParams["ytick.color"] = "#596273"

        figures = (
            plot_classifier_applicability(report, source_hash=source_hash),
            plot_judge_health(report, source_hash=source_hash),
            plot_vote_economics(report, source_hash=source_hash),
            plot_gold_evaluation(report, source_hash=source_hash),
            plot_overview(report, source_hash=source_hash),
        )
        for figure, path in zip(figures, graph_paths, strict=True):
            save_figure(figure, path, source_hash=source_hash)

        markdown_path = output_directory / MARKDOWN_REPORT_NAME
        write_markdown(report, markdown_path, source_hash=source_hash)
        pdf_path = output_directory / PDF_REPORT_NAME
        presentation_order = (graph_paths[-1], *graph_paths[:-1])
        write_pdf(presentation_order, pdf_path, source_hash=source_hash)
        html_path = output_directory / HTML_REPORT_NAME
        write_html(report, presentation_order, html_path, source_hash=source_hash)

    outputs = (*graph_paths, markdown_path, pdf_path, html_path)
    return PolicyVisualizationRun(
        graphs=graph_paths,
        explainer_md=markdown_path,
        report_pdf=pdf_path,
        report_html=html_path,
        report_metadata_hash=source_hash,
        content_hashes=hash_outputs(outputs, source_hash=source_hash),
    )


def visualize_policy_report(
    report_directory: Path,
    output_directory: Path,
) -> PolicyVisualizationRun:
    """Render one fully validated policy-report artifact synchronously.

    Raises:
        OSError: A source or output file cannot be read or written.
        ValueError: The report artifact or a generated source binding is invalid.

    """
    artifact = load_policy_report_artifact(report_directory)
    return _visualize(artifact, output_directory)


async def visualize_policy_report_async(
    report_directory: Path,
    output_directory: Path,
) -> PolicyVisualizationRun:
    """Validate and render a policy report without blocking Trio's event loop.

    Matplotlib and output publication run in one worker because Matplotlib's
    process-global state is not safe to split across concurrent workers.

    Raises:
        OSError: A source or output file cannot be read or written.
        ValueError: The report artifact or a generated source binding is invalid.

    """
    artifact = await load_policy_report_artifact_async(report_directory)
    operation = partial(_visualize, artifact, output_directory)
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
