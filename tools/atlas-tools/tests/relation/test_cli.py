"""Pydantic Settings CLI tests for relation-card set operations."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.common import sha256_file
from atlas_tools.common.progress import NO_PROGRESS
from atlas_tools.relation import cli
from atlas_tools.relation.concat import ConcatPaths
from atlas_tools.relation.eval.run import (
    ConcurrencyConfig,
    JudgeConfig,
    LoadedRunConfig,
    PilotPaths,
    PilotRunConfig,
    SliceSamplingConfig,
)


def test_cli_concat_passes_inputs_and_echoes_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    first = tmp_path / "a"
    second = tmp_path / "b"
    first.mkdir()
    second.mkdir()
    out = tmp_path / "out"

    captured: dict[str, object] = {}

    def concat(paths: list[Path], *, out: Path) -> ConcatPaths:
        captured.update(paths=paths, out=out)
        return ConcatPaths(
            cards_jsonl=out / "cards.jsonl",
            manifest=out / "cards.manifest.json",
        )

    monkeypatch.setattr("atlas_tools.relation.concat.concat_relations", concat)
    cli.main(["concat", str(first), str(second), "--out", str(out)])

    assert captured["paths"] == [first, second]
    assert captured["out"] == out
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'cards.jsonl'}" in stdout
    assert f"wrote {out / 'cards.manifest.json'}" in stdout


def test_cli_concat_rejects_missing_input_directory(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["concat", str(tmp_path / "missing"), "--out", str(tmp_path / "out")])
    assert excinfo.value.code == 2


def test_cli_concat_fails_cleanly_on_runtime_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    existing = tmp_path / "a"
    existing.mkdir()

    out = tmp_path / "out"

    def concat(paths: list[Path], *, out: Path) -> ConcatPaths:
        assert paths == [existing]
        assert out == tmp_path / "out"
        raise ValueError("hash mismatch")

    monkeypatch.setattr("atlas_tools.relation.concat.concat_relations", concat)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["concat", str(existing), "--out", str(out)])

    assert excinfo.value.code == 1
    assert "Error: hash mismatch" in capsys.readouterr().err


def _judge() -> JudgeConfig:
    return JudgeConfig(
        provider_slug="test-provider/endpoint",
        provider_name="Test Provider",
        model="test/model",
    )


def test_cli_evaluate_dispatches_pilot_and_echoes_handoff_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    cards.mkdir()
    config_path = tmp_path / "judges.yaml"
    config_path.touch()
    out = tmp_path / "handoff"
    loaded_config = LoadedRunConfig(
        path=config_path,
        config=PilotRunConfig(
            schema_version=3,
            mode="pilot",
            sampling=SliceSamplingConfig(seed=42, non_holdout_count=1),
            concurrency=ConcurrencyConfig(initial=1, maximum=1),
            judges=[_judge()],
        ),
        content_hash=sha256_file(config_path),
    )
    captured: dict[str, object] = {}

    def load(path: Path) -> LoadedRunConfig:
        captured["config_path"] = path
        return loaded_config

    def evaluate(
        *,
        cards_dir: Path,
        out_dir: Path,
        loaded_config: LoadedRunConfig,
        progress: object,
    ) -> PilotPaths:
        captured.update(
            cards=cards_dir,
            out=out_dir,
            loaded_config=loaded_config,
            progress=progress,
        )
        return PilotPaths(
            votes_jsonl=out / "votes.jsonl",
            attempts_jsonl=out / "attempts.jsonl",
            slice_jsonl=out / "slice.jsonl",
            manifest_json=out / "manifest.json",
            run_state_json=out / "run-state.json",
            inflight_dir=out / "inflight",
            lock_file=out / ".run.lock",
        )

    monkeypatch.setattr("atlas_tools.relation.eval.run.load_run_config", load)
    monkeypatch.setattr("atlas_tools.relation.eval.run.run_evaluation", evaluate)
    cli.main(["evaluate", str(cards), str(config_path), "--out", str(out), "--quiet"])

    assert captured == {
        "config_path": config_path,
        "cards": cards,
        "out": out,
        "loaded_config": loaded_config,
        "progress": NO_PROGRESS,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'votes.jsonl'}" in stdout
    assert f"wrote {out / 'attempts.jsonl'}" in stdout
    assert f"wrote {out / 'slice.jsonl'}" in stdout
    assert f"wrote {out / 'manifest.json'}" in stdout


def test_cli_analyze_passes_handoff_and_echoes_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    handoff = tmp_path / "handoff"
    handoff.mkdir()
    out = tmp_path / "out"
    decisions = out / "decisions.json"
    report = out / "report.md"
    captured: dict[str, Path] = {}

    def analyze(handoff_dir: Path, out_dir: Path) -> SimpleNamespace:
        captured.update(handoff=handoff_dir, out=out_dir)
        return SimpleNamespace(decisions_json=decisions, report_md=report)

    monkeypatch.setattr("atlas_tools.relation.eval.analysis.analyze_handoff", analyze)
    cli.main(["analyze", str(handoff), "--out", str(out)])

    assert captured == {"handoff": handoff, "out": out}
    stdout = capsys.readouterr().out
    assert f"wrote {decisions}" in stdout
    assert f"wrote {report}" in stdout


def test_cli_analyze_rejects_missing_handoff_directory(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.main(
            [
                "analyze",
                str(tmp_path / "missing"),
                "--out",
                str(tmp_path / "out"),
            ]
        )
    assert excinfo.value.code == 2


def test_cli_analyze_fails_cleanly_on_validation_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    handoff = tmp_path / "handoff"
    handoff.mkdir()

    out = tmp_path / "out"

    def analyze(handoff_dir: Path, out_dir: Path) -> SimpleNamespace:
        assert handoff_dir == handoff
        assert out_dir == out
        raise ValueError("missing votes.jsonl")

    monkeypatch.setattr("atlas_tools.relation.eval.analysis.analyze_handoff", analyze)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["analyze", str(handoff), "--out", str(out)])

    assert excinfo.value.code == 1
    assert "Error: missing votes.jsonl" in capsys.readouterr().err


def test_cli_visualize_passes_analysis_and_echoes_graphs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    analysis = tmp_path / "analysis"
    analysis.mkdir()
    out = tmp_path / "graphs"
    graphs = (out / "data-health.png", out / "qualification.png")
    explainer = out / "results-overview.md"
    pdf = out / "results-report.pdf"
    html = out / "results-report.html"
    captured: dict[str, Path] = {}

    def visualize(analysis_dir: Path, out_dir: Path) -> SimpleNamespace:
        captured.update(analysis=analysis_dir, out=out_dir)
        return SimpleNamespace(
            graphs=graphs,
            explainer_md=explainer,
            report_pdf=pdf,
            report_html=html,
        )

    monkeypatch.setattr(
        "atlas_tools.relation.eval.visualization.visualize_analysis",
        visualize,
    )
    cli.main(["visualize", str(analysis), "--out", str(out)])

    assert captured == {"analysis": analysis, "out": out}
    stdout = capsys.readouterr().out
    assert all(f"wrote {graph}" in stdout for graph in graphs)
    assert f"wrote {explainer}" in stdout
    assert f"wrote {pdf}" in stdout
    assert f"wrote {html}" in stdout


def test_cli_visualize_rejects_missing_analysis_directory(tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as excinfo:
        cli.main(
            [
                "visualize",
                str(tmp_path / "missing"),
                "--out",
                str(tmp_path / "graphs"),
            ]
        )
    assert excinfo.value.code == 2


def test_cli_visualize_fails_cleanly_on_invalid_decisions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    analysis = tmp_path / "analysis"
    analysis.mkdir()
    out = tmp_path / "graphs"

    def visualize(analysis_dir: Path, out_dir: Path) -> SimpleNamespace:
        assert analysis_dir == analysis
        assert out_dir == out
        raise ValueError("invalid decisions.json")

    monkeypatch.setattr(
        "atlas_tools.relation.eval.visualization.visualize_analysis",
        visualize,
    )
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["visualize", str(analysis), "--out", str(out)])

    assert excinfo.value.code == 1
    assert "Error: invalid decisions.json" in capsys.readouterr().err
