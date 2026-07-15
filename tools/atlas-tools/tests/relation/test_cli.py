"""CLI tests for relation artifact publication, evaluation, and status commands."""

from collections.abc import Callable
from pathlib import Path

import pytest

from atlas_tools.common.progress import NO_PROGRESS
from atlas_tools.relation import cli
from atlas_tools.relation.concat.api import ConcatPaths
from atlas_tools.relation.evaluation.storage.api import GridPaths, JournalPaths, PilotPaths
from atlas_tools.relation.family_closure.api import FamilyClosurePaths


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

    monkeypatch.setattr("atlas_tools.relation.concat.api.concat_relations", concat)
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

    monkeypatch.setattr("atlas_tools.relation.concat.api.concat_relations", concat)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["concat", str(existing), "--out", str(out)])
    assert excinfo.value.code == 1
    assert "Error: hash mismatch" in capsys.readouterr().err


def test_cli_closure_passes_verified_inputs_and_echoes_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    first = tmp_path / "wikidata-lineage"
    second = tmp_path / "hash-lineage"
    for directory in (cards, first, second):
        directory.mkdir()
    out = tmp_path / "closure"
    captured: dict[str, object] = {}

    def publish(
        cards_directory: Path,
        lineage_directories: list[Path],
        *,
        output_directory: Path,
    ) -> FamilyClosurePaths:
        captured.update(
            cards=cards_directory,
            lineages=lineage_directories,
            out=output_directory,
        )
        return FamilyClosurePaths(
            families_jsonl=output_directory / "families.jsonl",
            manifest=output_directory / "families.manifest.json",
        )

    monkeypatch.setattr(
        "atlas_tools.relation.family_closure.api.publish_family_closure",
        publish,
    )
    cli.main(
        [
            "closure",
            str(cards),
            str(first),
            str(second),
            "--out",
            str(out),
        ]
    )
    assert captured == {
        "cards": cards,
        "lineages": [first, second],
        "out": out,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {out / 'families.jsonl'}" in stdout
    assert f"wrote {out / 'families.manifest.json'}" in stdout


@pytest.mark.parametrize("missing", ["cards", "lineage"])
def test_cli_closure_rejects_missing_input_directory(tmp_path: Path, missing: str) -> None:
    cards = tmp_path / "cards"
    lineage = tmp_path / "lineage"
    cards.mkdir()
    lineage.mkdir()
    if missing == "cards":
        cards.rmdir()
    else:
        lineage.rmdir()
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["closure", str(cards), str(lineage), "--out", str(tmp_path / "out")])
    assert excinfo.value.code == 2


def test_cli_closure_fails_cleanly_on_publication_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cards = tmp_path / "cards"
    lineage = tmp_path / "lineage"
    cards.mkdir()
    lineage.mkdir()
    out = tmp_path / "closure"

    def publish(
        cards_directory: Path,
        lineage_directories: list[Path],
        *,
        output_directory: Path,
    ) -> FamilyClosurePaths:
        assert cards_directory == cards
        assert lineage_directories == [lineage]
        assert output_directory == out
        raise FileExistsError("family closure destination already exists")

    monkeypatch.setattr(
        "atlas_tools.relation.family_closure.api.publish_family_closure",
        publish,
    )
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["closure", str(cards), str(lineage), "--out", str(out)])
    assert excinfo.value.code == 1
    assert "Error: family closure destination already exists" in capsys.readouterr().err


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
        "atlas_tools.relation.evaluation.application.run.run_evaluation",
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
        "atlas_tools.relation.evaluation.application.run.run_evaluation",
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


def test_cli_status_runs_the_dashboard_with_operator_options(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run = tmp_path / "grid"
    run.mkdir()
    captured: dict[str, object] = {}

    class Reader:
        def __init__(self, directory: Path, *, trigger_rate: float) -> None:
            captured.update(directory=directory, trigger_rate=trigger_rate)

        @staticmethod
        def snapshot() -> str:
            return "snapshot"

    def render(
        loader: Callable[[], object],
        *,
        refresh_seconds: float,
        once: bool,
    ) -> None:
        captured.update(
            sample=loader(),
            refresh_seconds=refresh_seconds,
            once=once,
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.grid_status.GridStatusReader",
        Reader,
    )
    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.visualization.api.run_grid_status",
        render,
    )
    cli.main(
        [
            "status",
            str(run),
            "--refresh-seconds",
            "1.5",
            "--trigger-rate",
            "0.25",
            "--once",
        ]
    )
    assert captured == {
        "directory": run,
        "trigger_rate": 0.25,
        "sample": "snapshot",
        "refresh_seconds": 1.5,
        "once": True,
    }
