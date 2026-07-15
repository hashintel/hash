import hashlib
import json
from pathlib import Path
from threading import Event

import pytest
import trio

import atlas_tools.relation.evaluation.application.pilot_visualization as visualization_module
from atlas_tools.relation.evaluation.application.pilot_analysis import analyze_handoff
from atlas_tools.relation.evaluation.application.pilot_visualization import (
    PilotVisualizationRun,
    visualize_analysis,
    visualize_analysis_async,
)

_ROOT = Path(__file__).parents[3]
_PAID = _ROOT / "runs" / "evaluate-v2"
_DECISIONS_HASH = "a059eaa8c316c19957b830ead3da326809f61eba233c8f6b8bded7402b120cb4"
_GRAPH_NAMES = (
    "data-health.png",
    "qualification.png",
    "stability-admissions.png",
    "effort-economics.png",
    "results-overview.png",
)


@pytest.fixture(scope="module")
def analysis_directory(tmp_path_factory: pytest.TempPathFactory) -> Path:
    directory = tmp_path_factory.mktemp("pilot-visualization-analysis")
    analyze_handoff(_PAID, directory)
    return directory


@pytest.fixture(scope="module")
def visualization(
    analysis_directory: Path,
    tmp_path_factory: pytest.TempPathFactory,
) -> PilotVisualizationRun:
    return visualize_analysis(
        analysis_directory,
        tmp_path_factory.mktemp("pilot-visualization-output"),
    )


def _outputs(run: PilotVisualizationRun) -> tuple[Path, ...]:
    return (*run.graphs, run.explainer_md, run.report_pdf, run.report_html)


def test_visualization_preserves_decisions_and_cli_output_contract(
    visualization: PilotVisualizationRun,
) -> None:
    assert visualization.decisions_hash == _DECISIONS_HASH
    assert tuple(path.name for path in visualization.graphs) == _GRAPH_NAMES
    assert visualization.explainer_md.name == "results-overview.md"
    assert visualization.report_pdf.name == "results-report.pdf"
    assert visualization.report_html.name == "results-report.html"

    outputs = _outputs(visualization)
    source = _DECISIONS_HASH.encode("ascii")
    assert all(source in path.read_bytes() for path in outputs)
    assert all(path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") for path in visualization.graphs)
    assert visualization.report_pdf.read_bytes().startswith(b"%PDF-")

    markdown = visualization.explainer_md.read_bytes()
    assert markdown.isascii()
    assert b"Qualified families: anthropic/claude-opus-4.8" in markdown
    assert b"shell S2: REJECT" in markdown
    assert b"Projected full-grid cost: $209.37" in markdown

    html = visualization.report_html.read_bytes()
    assert html.isascii()
    assert html.startswith(b"<!doctype html>")
    assert b'alt="Missing coverage, routing violations, and abstentions' in html

    assert dict(visualization.content_hashes) == {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in outputs
    }


def test_visualization_is_byte_deterministic(
    analysis_directory: Path,
    visualization: PilotVisualizationRun,
    tmp_path: Path,
) -> None:
    rendered = visualize_analysis(analysis_directory, tmp_path)

    assert dict(rendered.content_hashes) == dict(visualization.content_hashes)


def test_async_visualization_keeps_the_event_loop_responsive(
    analysis_directory: Path,
    visualization: PilotVisualizationRun,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = Event()
    release = Event()

    def block_worker(
        _loaded: object,
        _output_directory: Path,
    ) -> PilotVisualizationRun:
        entered.set()
        if not release.wait(timeout=5):
            raise TimeoutError("test did not release the visualization worker")
        return visualization

    monkeypatch.setattr(visualization_module, "_visualize", block_worker)

    async def scenario() -> PilotVisualizationRun:
        results: list[PilotVisualizationRun] = []

        async def render() -> None:
            results.append(await visualize_analysis_async(analysis_directory, tmp_path))

        async with trio.open_nursery() as nursery:
            nursery.start_soon(render)
            with trio.fail_after(5):
                while not entered.is_set():
                    await trio.lowlevel.checkpoint()
            release.set()
        assert len(results) == 1
        return results[0]

    assert trio.run(scenario) is visualization


def test_visualization_rejects_projection_drift_before_writing(
    analysis_directory: Path,
    tmp_path: Path,
) -> None:
    tampered = tmp_path / "analysis"
    tampered.mkdir()
    payload = json.loads((analysis_directory / "decisions.json").read_bytes())
    payload["qualified_families"] = []
    (tampered / "decisions.json").write_text(
        json.dumps(payload, ensure_ascii=True, sort_keys=True),
        encoding="ascii",
    )
    output = tmp_path / "visualization"

    with pytest.raises(ValueError, match="qualified families disagree"):
        visualize_analysis(tampered, output)

    assert not output.exists()
