from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.relation import cli


def test_cli_visualize_report_uses_the_validated_application_surface(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    report = tmp_path / "report"
    report.mkdir()
    output = tmp_path / "visualization"
    graphs = (
        output / "classifier-applicability.png",
        output / "judge-health.png",
        output / "vote-economics.png",
        output / "gold-evaluation.png",
        output / "results-overview.png",
    )
    explainer = output / "results-overview.md"
    pdf = output / "results-report.pdf"
    html = output / "results-report.html"
    captured: dict[str, Path] = {}

    def visualize(report_directory: Path, output_directory: Path) -> SimpleNamespace:
        captured.update(report=report_directory, output=output_directory)
        return SimpleNamespace(
            graphs=graphs,
            explainer_md=explainer,
            report_pdf=pdf,
            report_html=html,
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.visualize_policy_report",
        visualize,
    )
    cli.main(["visualize-report", str(report), "--out", str(output)])

    assert captured == {"report": report, "output": output}
    stdout = capsys.readouterr().out
    assert all(f"wrote {graph}" in stdout for graph in graphs)
    assert f"wrote {explainer}" in stdout
    assert f"wrote {pdf}" in stdout
    assert f"wrote {html}" in stdout


def test_cli_visualize_report_rejects_a_missing_report_directory(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as exception:
        cli.main(
            [
                "visualize-report",
                str(tmp_path / "missing"),
                "--out",
                str(tmp_path / "visualization"),
            ]
        )
    assert exception.value.code == 2
