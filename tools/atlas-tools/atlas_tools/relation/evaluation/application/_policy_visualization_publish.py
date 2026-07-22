"""Publish deterministic policy-report visualizations and prose bundles."""

import base64
import hashlib
import json
import os
import tempfile
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from html import escape
from pathlib import Path
from types import MappingProxyType

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.figure import Figure

from atlas_tools.relation.evaluation.analysis.api import (
    PolicyReportWithoutGold,
    PublishedPolicyReport,
    RateMetric,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

DETAIL_GRAPH_NAMES = (
    "classifier-applicability.png",
    "judge-health.png",
    "vote-economics.png",
    "gold-evaluation.png",
)
OVERVIEW_GRAPH_NAME = "results-overview.png"
GRAPH_NAMES = (*DETAIL_GRAPH_NAMES, OVERVIEW_GRAPH_NAME)
MARKDOWN_REPORT_NAME = "results-overview.md"
PDF_REPORT_NAME = "results-report.pdf"
HTML_REPORT_NAME = "results-report.html"
GRAPH_DESCRIPTIONS: Mapping[str, str] = MappingProxyType(
    {
        "classifier-applicability.png": (
            "Held-out classifier applicability distributions by card producer"
        ),
        "judge-health.png": "Abstention, schema compliance, repair, and latency by judge family",
        "vote-economics.png": "Imported, baseline, and refinement votes with known cost by family",
        "gold-evaluation.png": (
            "Gold agreement, calibration, and release evidence, or an explicit unavailable state"
        ),
        "results-overview.png": "Policy evaluation coverage, health, economics, and evidence state",
    }
)

INK = "#172033"
MUTED = "#596273"
GRID = "#D7DCE2"
BLUE = "#0072B2"
GREEN = "#009E73"
ORANGE = "#E69F00"
VERMILLION = "#D55E00"
PURPLE = "#CC79A7"
GRAY = "#8A94A6"
LIGHT = "#F3F5F7"
_FIXED_PDF_DATE = datetime(2000, 1, 1, tzinfo=UTC)


def _atomic_generate(path: Path, writer: Callable[[Path], None]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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
        os.rename(temporary, path)  # noqa: PTH104 -- os.rename is the requested primitive.
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


def save_figure(fig: Figure, path: Path, *, source_hash: Sha256Hex) -> None:
    """Publish one deterministic PNG carrying the source metadata hash."""

    def write(temporary: Path) -> None:
        fig.savefig(
            temporary,
            format="png",
            dpi=144,
            bbox_inches="tight",
            facecolor="white",
            metadata={
                "Description": f"source-sha256={source_hash}",
                "Software": "atlas-tools relation evaluation",
            },
        )

    try:
        _atomic_generate(path, write)
    finally:
        plt.close(fig)


def _rate(metric: RateMetric | None) -> str:
    if metric is None or metric.value is None:
        return "unavailable"
    return f"{metric.value:.1%} ({metric.numerator}/{metric.denominator})"


def _ascii(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)[1:-1]


def _gold_lines(report: PublishedPolicyReport) -> list[str]:
    if isinstance(report, PolicyReportWithoutGold):
        return [
            "- Gold: not provided.",
            "- Agreement, calibration, judge gold agreement, and the Coincident release gate "
            "are unavailable.",
        ]
    classifier_agreement = (
        "not provided" if report.classifier is None else _rate(report.classifier.gold.agreement)
    )
    wilson_lcb = report.coincident_gate.wilson_lcb
    bound = "unavailable" if wilson_lcb is None else f"{wilson_lcb:.6f}"
    return [
        f"- Gold: evaluated ({report.gold_cards} rows; "
        f"{report.gold_post_exposure} post-exposure excluded).",
        f"- Panel agreement: {_rate(report.panel_gold.agreement)}.",
        f"- Classifier agreement: {classifier_agreement}.",
        f"- Coincident gate: {report.coincident_gate.verdict}; Wilson LCB {bound}.",
    ]


def render_markdown(report: PublishedPolicyReport, *, source_hash: Sha256Hex) -> str:
    """Render the deterministic visualization explainer."""
    classifier = report.classifier
    economics = report.economics
    lines = [
        "# Relation policy evaluation - visual overview",
        "",
        f"Source report metadata SHA-256: `{source_hash}`.",
        "",
        "## Evidence state",
        "",
        f"- Eligible cards: {report.eligible_cards}.",
        f"- Classifier: {report.classifier_state}.",
        *(_gold_lines(report)),
        "",
        "## Operational summary",
        "",
        f"- Judge families: {len(report.judges)}.",
        f"- Total votes: {economics.total_votes}.",
        f"- Refined cards: {economics.refined_cards}/{economics.pool_cards} "
        f"({economics.realized_trigger_rate:.1%}).",
        f"- Coincident review queue: {economics.review_queue_cards} cards.",
        f"- Fresh known cost: ${economics.total_known_cost_usd:,.2f}.",
    ]
    if classifier is not None:
        lines.extend(
            [
                f"- Classifier predictions: {classifier.predictions}.",
                f"- Classifier decision threshold: {classifier.decision_threshold:.3f}.",
            ]
        )
    lines.extend(
        [
            "",
            "## Images",
            "",
            *(f"- `{name}`: {GRAPH_DESCRIPTIONS[name]}." for name in GRAPH_NAMES),
            "",
            "Intervals and unavailable states are shown explicitly. Missing evidence is not zero.",
            "",
        ]
    )
    rendered = "\n".join(lines)
    rendered.encode("ascii")
    return rendered


def _image_data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def render_html(
    report: PublishedPolicyReport,
    graphs: Sequence[Path],
    *,
    source_hash: Sha256Hex,
) -> str:
    """Render one self-contained HTML report with embedded PNGs."""
    figures = "\n".join(
        f'<figure><img src="{_image_data_uri(path)}" '
        f'alt="{escape(GRAPH_DESCRIPTIONS[path.name])}">'
        f"<figcaption>{escape(GRAPH_DESCRIPTIONS[path.name])}</figcaption></figure>"
        for path in graphs
    )
    gold_state = "not provided" if isinstance(report, PolicyReportWithoutGold) else "evaluated"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="ascii">
<meta name="source-sha256" content="{source_hash}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relation policy evaluation</title>
<style>
:root {{ --ink:{INK}; --muted:{MUTED}; --line:{GRID}; --surface:#fff; --bg:{LIGHT}; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
header {{ padding:44px max(5vw,24px); background:var(--ink); color:white; }}
header h1 {{ margin:0 0 8px; font-size:clamp(30px,4vw,48px); }}
header p {{ margin:0; color:#CDD4DE; overflow-wrap:anywhere; }}
main {{ width:min(1180px,92vw); margin:40px auto 72px; }}
.summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:16px; margin-bottom:32px; }}
.summary div {{ padding:20px; background:white; border:1px solid var(--line); }}
.summary span {{ display:block; color:var(--muted); font-size:14px; }}
.summary strong {{ display:block; margin-top:4px; font-size:22px; overflow-wrap:anywhere; }}
figure {{ margin:32px 0; padding:18px; background:var(--surface); border:1px solid var(--line); }}
img {{ display:block; width:100%; height:auto; }}
figcaption {{ margin-top:12px; color:var(--muted); }}
footer {{ margin-top:44px; padding-top:20px; border-top:1px solid var(--line);
  color:var(--muted); overflow-wrap:anywhere; }}
@media print {{ body {{ background:white; }} figure {{ break-inside:avoid; }} }}
</style>
</head>
<body>
<header><h1>Relation policy evaluation</h1>
<p>Source report metadata SHA-256: {source_hash}</p></header>
<main>
<section class="summary">
<div><span>Eligible cards</span><strong>{report.eligible_cards:,}</strong></div>
<div><span>Classifier</span><strong>{escape(_ascii(report.classifier_state))}</strong></div>
<div><span>Gold</span><strong>{gold_state}</strong></div>
<div><span>Fresh known cost</span>
<strong>${report.economics.total_known_cost_usd:,.2f}</strong></div>
</section>
{figures}
<footer>Unavailable evidence is not rendered as zero. Source report metadata SHA-256:
{source_hash}.</footer>
</main>
</body>
</html>
"""


def write_markdown(
    report: PublishedPolicyReport,
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    _atomic_bytes(path, render_markdown(report, source_hash=source_hash).encode("ascii"))


def write_html(
    report: PublishedPolicyReport,
    graphs: Sequence[Path],
    path: Path,
    *,
    source_hash: Sha256Hex,
) -> None:
    payload = render_html(report, graphs, source_hash=source_hash).encode("ascii")
    _atomic_bytes(path, payload)


def write_pdf(graphs: Sequence[Path], path: Path, *, source_hash: Sha256Hex) -> None:
    """Publish a deterministic multipage PDF in the requested graph order."""
    metadata = {
        "Author": "atlas-tools relation evaluation",
        "CreationDate": _FIXED_PDF_DATE,
        "Creator": "atlas-tools relation evaluation",
        "Keywords": f"source-sha256={source_hash}",
        "ModDate": _FIXED_PDF_DATE,
        "Subject": f"Policy evaluation evidence; source-sha256={source_hash}",
        "Title": "Relation policy evaluation",
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
                        GRAPH_DESCRIPTIONS[graph.name],
                        fontsize=15,
                        fontweight="bold",
                    )
                    pdf.savefig(fig, bbox_inches="tight", facecolor="white")
                finally:
                    plt.close(fig)

    _atomic_generate(path, write)


def hash_outputs(paths: Sequence[Path], *, source_hash: Sha256Hex) -> Mapping[str, Sha256Hex]:
    """Verify source binding and return a hash for every generated file."""
    source = source_hash.encode("ascii")
    hashes: dict[str, Sha256Hex] = {}
    for path in paths:
        payload = path.read_bytes()
        if source not in payload:
            raise ValueError(f"visualization output does not bind its report source: {path}")
        if path.suffix in {".md", ".html"} and not payload.isascii():
            raise ValueError(f"visualization prose is not ASCII: {path}")
        hashes[path.name] = hashlib.sha256(payload).hexdigest()
    return MappingProxyType(hashes)
