from pathlib import Path

import pytest

from atlas_tools.relation.eval.analysis import analyze_handoff
from atlas_tools.relation.eval.schema import Estimate
from atlas_tools.relation.eval.visualization import (
    _alpha_interpretation,
    _noise_interpretation,
    _shell_interpretation,
    visualize_analysis,
)
from tests.relation.test_eval_analysis import _write_handoff

EXPECTED_GRAPHS = {
    "agreement.png",
    "card-posteriors.png",
    "cost-and-escalation.png",
    "data-health.png",
    "flip-rates.png",
    "qualification.png",
    "results-overview.png",
    "verdict-marginals.png",
}


def test_visualize_analysis_renders_all_graphs(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff")
    analysis = analyze_handoff(handoff, tmp_path / "analysis")

    result = visualize_analysis(analysis.decisions_json.parent, tmp_path / "graphs")

    assert {path.name for path in result.graphs} == EXPECTED_GRAPHS
    assert all(path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") for path in result.graphs)
    explainer = result.explainer_md.read_text()
    assert "## Bottom line" in explainer
    assert "## How to read the image" in explainer
    assert "Qualified-panel agreement" in explainer
    assert "All-candidate agreement" in explainer
    assert "Krippendorff α" in explainer  # noqa: RUF001
    assert "did not execute a live, dynamic escalation workflow" in explainer
    assert "below 0.667 and too weak to treat judges as interchangeable" in explainer
    assert "No repeat flips were observed" in explainer
    assert result.report_pdf.read_bytes().startswith(b"%PDF")
    html = result.report_html.read_text()
    assert "<!doctype html>" in html
    assert "No live escalation workflow ran during the pilot" in html
    assert "Qualified-panel Krippendorff α" in html  # noqa: RUF001
    assert "All-candidate Krippendorff α" in html  # noqa: RUF001
    assert "0 is chance, 0.667 is tentative" in html
    assert "How often shell wording changed a stable verdict" in html
    assert "data:image/png;base64," in html


def test_interpretations_treat_threshold_values_as_borderline() -> None:
    estimate = Estimate(est=0.05, lo=0.03, hi=0.07, n=100)

    assert "exactly at the 5% maximum" in _noise_interpretation(estimate, 0.05)
    assert "borderline and leaves no safety margin" in _noise_interpretation(estimate, 0.05)
    assert "exactly at the 5% maximum" in _shell_interpretation(estimate, 0.05)


def test_interpretation_treats_alpha_point_six_as_weak() -> None:
    estimate = Estimate(est=0.6, lo=0.5, hi=0.7, n=100)

    interpretation = _alpha_interpretation(estimate)
    assert "below 0.667" in interpretation
    assert "too weak to treat judges as interchangeable" in interpretation


def test_visualize_analysis_requires_decisions_json(tmp_path: Path) -> None:
    analysis = tmp_path / "analysis"
    analysis.mkdir()

    with pytest.raises(FileNotFoundError, match=r"decisions\.json"):
        visualize_analysis(analysis, tmp_path / "graphs")
