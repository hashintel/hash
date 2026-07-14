"""Pydantic Settings CLI tests for relation-card set operations."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.common.progress import NO_PROGRESS
from atlas_tools.relation import cli
from atlas_tools.relation.concat import ConcatPaths
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    JournalPaths,
    PilotPaths,
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


def test_cli_family_overlay_passes_the_reviewed_mapping_and_echoes_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    cards.mkdir()
    assignments = tmp_path / "families.jsonl"
    assignments.touch()
    out = tmp_path / "enriched"
    captured: dict[str, object] = {}

    def overlay(cards: Path, assignments: Path, *, out: Path) -> ConcatPaths:
        captured.update(cards=cards, assignments=assignments, out=out)
        return ConcatPaths(
            cards_jsonl=out / "cards.jsonl",
            manifest=out / "cards.manifest.json",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.family_overlay.apply_family_overlay",
        overlay,
    )
    cli.main(["family-overlay", str(cards), str(assignments), "--out", str(out)])

    assert captured == {"cards": cards, "assignments": assignments, "out": out}
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'cards.jsonl'}" in stdout
    assert f"wrote {out / 'cards.manifest.json'}" in stdout


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
    captured: dict[str, object] = {}

    def evaluate(
        *,
        cards_directory: Path,
        config_path: Path,
        output_directory: Path,
        pilot_directory: Path | None,
        progress: object,
    ) -> PilotPaths:
        captured.update(
            cards=cards_directory,
            config=config_path,
            out=output_directory,
            pilot=pilot_directory,
            progress=progress,
        )
        return PilotPaths(
            journal=JournalPaths.under(output_directory),
            slice=output_directory / "slice.jsonl",
            state=output_directory / "run-state.json",
            manifest=output_directory / "manifest.json",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.run_evaluation",
        evaluate,
    )
    cli.main(["evaluate", str(cards), str(config_path), "--out", str(out), "--quiet"])

    assert captured == {
        "cards": cards,
        "config": config_path,
        "out": out,
        "pilot": None,
        "progress": NO_PROGRESS,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'votes.jsonl'}" in stdout
    assert f"wrote {out / 'attempts.jsonl'}" in stdout
    assert f"wrote {out / 'slice.jsonl'}" in stdout
    assert f"wrote {out / 'manifest.json'}" in stdout


def test_cli_evaluate_passes_the_pilot_handoff_and_echoes_grid_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    cards.mkdir()
    pilot = tmp_path / "pilot"
    pilot.mkdir()
    config_path = tmp_path / "judges.yaml"
    config_path.touch()
    out = tmp_path / "grid"
    captured: dict[str, object] = {}

    def evaluate(
        *,
        cards_directory: Path,
        config_path: Path,
        output_directory: Path,
        pilot_directory: Path | None,
        progress: object,
    ) -> GridPaths:
        captured.update(
            cards=cards_directory,
            config=config_path,
            out=output_directory,
            pilot=pilot_directory,
            progress=progress,
        )
        return GridPaths(
            journal=JournalPaths.under(output_directory),
            corpus=output_directory / "corpus.jsonl",
            imported_votes=output_directory / "imported-votes.jsonl",
            imported_attempts=output_directory / "imported-attempts.jsonl",
            state=output_directory / "run-state.json",
            manifest=output_directory / "manifest.json",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.run_evaluation",
        evaluate,
    )
    cli.main(
        [
            "evaluate",
            str(cards),
            str(config_path),
            "--out",
            str(out),
            "--pilot",
            str(pilot),
            "--quiet",
        ]
    )

    assert captured == {
        "cards": cards,
        "config": config_path,
        "out": out,
        "pilot": pilot,
        "progress": NO_PROGRESS,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'votes.jsonl'}" in stdout
    assert f"wrote {out / 'corpus.jsonl'}" in stdout
    assert f"wrote {out / 'imported-votes.jsonl'}" in stdout
    assert f"wrote {out / 'manifest.json'}" in stdout


def test_cli_aggregate_uses_the_verified_application_boundary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    run = tmp_path / "run"
    cards = tmp_path / "cards"
    run.mkdir()
    cards.mkdir()
    config = tmp_path / "grid.yaml"
    config.touch()
    output = tmp_path / "soft-labels.parquet"
    captured: dict[str, Path] = {}

    def aggregate(**paths: Path) -> SimpleNamespace:
        captured.update(paths)
        return SimpleNamespace(
            path=output,
            sidecar_path=output.with_name(f"{output.name}.meta.json"),
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.aggregate_soft_labels",
        aggregate,
    )
    cli.main(
        [
            "aggregate",
            str(run),
            str(cards),
            str(config),
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "run_directory": run,
        "cards_directory": cards,
        "config_path": config,
        "output_path": output,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {output}" in stdout
    assert f"wrote {output.with_name(f'{output.name}.meta.json')}" in stdout


def test_cli_embed_passes_progress_and_emits_the_bound_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    cards.mkdir()
    config = tmp_path / "grid.yaml"
    config.touch()
    output = tmp_path / "embeddings.parquet"
    cache = tmp_path / "embedding-cache"
    captured: dict[str, object] = {}

    def embed(**arguments: object) -> SimpleNamespace:
        captured.update(arguments)
        return SimpleNamespace(
            artifact=SimpleNamespace(
                path=output,
                sidecar_path=output.with_name(f"{output.name}.meta.json"),
            )
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.embed_grid",
        embed,
    )
    cli.main(
        [
            "embed",
            str(cards),
            str(config),
            "--out",
            str(output),
            "--cache",
            str(cache),
            "--quiet",
        ]
    )

    assert captured == {
        "config_path": config,
        "deck_directory": cards,
        "output_path": output,
        "cache_directory": cache,
        "progress": NO_PROGRESS,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {output}" in stdout
    assert f"wrote {output.with_name(f'{output.name}.meta.json')}" in stdout


def test_cli_fit_emits_the_complete_classifier_bundle(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    labels = tmp_path / "soft-labels.parquet"
    embeddings = tmp_path / "embeddings.parquet"
    config = tmp_path / "grid.yaml"
    for path in (labels, embeddings, config):
        path.touch()
    output = tmp_path / "classifier"
    captured: dict[str, Path] = {}

    def fit(**paths: Path) -> SimpleNamespace:
        captured.update(paths)
        return SimpleNamespace(
            metadata_path=output / "classifier.json",
            arrays_path=output / "arrays.npz",
            out_of_fold_path=output / "out-of-fold.parquet",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.fit_classifier",
        fit,
    )
    cli.main(
        [
            "fit",
            str(labels),
            str(embeddings),
            str(config),
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "soft_labels_path": labels,
        "embeddings_path": embeddings,
        "config_path": config,
        "output_directory": output,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {output / 'classifier.json'}" in stdout
    assert f"wrote {output / 'arrays.npz'}" in stdout
    assert f"wrote {output / 'out-of-fold.parquet'}" in stdout


def test_cli_report_uses_the_validated_policy_report_stack(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    run = tmp_path / "run"
    cards = tmp_path / "cards"
    classifier = tmp_path / "classifier"
    for directory in (run, cards, classifier):
        directory.mkdir()
    config = tmp_path / "grid.yaml"
    gold = tmp_path / "gold.jsonl"
    for path in (config, gold):
        path.touch()
    output = tmp_path / "report"
    captured: dict[str, Path | None] = {}

    def report(**paths: Path | None) -> SimpleNamespace:
        captured.update(paths)
        return SimpleNamespace(
            report_json_path=output / "report.json",
            report_markdown_path=output / "report.md",
            metadata_path=output / "report.meta.json",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.write_policy_report",
        report,
    )
    cli.main(
        [
            "report",
            str(run),
            str(cards),
            str(config),
            "--gold",
            str(gold),
            "--classifier",
            str(classifier),
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "run_directory": run,
        "cards_directory": cards,
        "config_path": config,
        "gold_path": gold,
        "classifier_directory": classifier,
        "output_directory": output,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {output / 'report.json'}" in stdout
    assert f"wrote {output / 'report.md'}" in stdout
    assert f"wrote {output / 'report.meta.json'}" in stdout


def _deliverables_result(out: Path) -> SimpleNamespace:
    return SimpleNamespace(
        posteriors_path=out / "posteriors.jsonl",
        coincident_queue_path=out / "coincident-queue.jsonl",
        nomination_queue_path=out / "nomination-queue.jsonl",
        dissent_ledger_path=out / "dissent-ledger.jsonl",
        gates_path=out / "gates.json",
        report_path=out / "report.md",
    )


def _deliverables_argv(tmp_path: Path, out: Path) -> list[str]:
    run = tmp_path / "run"
    cards = tmp_path / "cards"
    run.mkdir()
    cards.mkdir()
    config = tmp_path / "judges.yaml"
    config.touch()
    decisions = tmp_path / "decisions.json"
    decisions.touch()
    return [
        "deliverables",
        str(run),
        str(cards),
        str(config),
        "--decisions",
        str(decisions),
        "--out",
        str(out),
    ]


def test_cli_deliverables_echoes_artifacts_when_gates_pass(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    out = tmp_path / "deliverables"
    argv = _deliverables_argv(tmp_path, out)
    captured: dict[str, Path] = {}

    def write_deliverables(**paths: Path) -> SimpleNamespace:
        captured.update(paths)
        return _deliverables_result(out)

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.write_grid_deliverables",
        write_deliverables,
    )
    cli.main(argv)

    assert captured == {
        "run_directory": tmp_path / "run",
        "cards_directory": tmp_path / "cards",
        "config_path": tmp_path / "judges.yaml",
        "pilot_decisions_path": tmp_path / "decisions.json",
        "output_directory": out,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'posteriors.jsonl'}" in stdout
    assert f"wrote {out / 'coincident-queue.jsonl'}" in stdout
    assert f"wrote {out / 'nomination-queue.jsonl'}" in stdout
    assert f"wrote {out / 'dissent-ledger.jsonl'}" in stdout
    assert f"wrote {out / 'gates.json'}" in stdout
    assert f"wrote {out / 'report.md'}" in stdout


def test_cli_deliverables_exits_nonzero_when_a_blocking_gate_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    out = tmp_path / "deliverables"
    argv = _deliverables_argv(tmp_path, out)

    class BlockedError(RuntimeError):
        def __init__(self, run: SimpleNamespace) -> None:
            super().__init__("grid acceptance gates failed: holdout-drift")
            self.run = run

    def write_deliverables(**_kwargs: object) -> SimpleNamespace:
        raise BlockedError(_deliverables_result(out))

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.GridGatesBlockedError",
        BlockedError,
    )
    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.write_grid_deliverables",
        write_deliverables,
    )
    with pytest.raises(SystemExit) as excinfo:
        cli.main(argv)

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert f"wrote {out / 'gates.json'}" in captured.out
    assert "grid acceptance gates failed: holdout-drift" in captured.err


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

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.analyze_handoff",
        analyze,
    )
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

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.analyze_handoff",
        analyze,
    )
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
        "atlas_tools.relation.evaluation.application.api.visualize_analysis",
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
        "atlas_tools.relation.evaluation.application.api.visualize_analysis",
        visualize,
    )
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["visualize", str(analysis), "--out", str(out)])

    assert excinfo.value.code == 1
    assert "Error: invalid decisions.json" in capsys.readouterr().err
