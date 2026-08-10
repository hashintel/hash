"""CLI tests for the obligatory Coincident review command."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.relation import cli


def test_cli_review_coincident_forwards_inputs_and_echoes_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    deliverables = tmp_path / "deliverables"
    cards = tmp_path / "cards"
    deliverables.mkdir()
    cards.mkdir()
    output = tmp_path / "reviews"
    rows_path = output / "coincident-reviews.jsonl"
    manifest_path = output / "coincident-reviews.manifest.json"
    captured: dict[str, Path | str] = {}

    def review(**arguments: Path | str) -> SimpleNamespace:
        captured.update(arguments)
        return SimpleNamespace(
            paths=SimpleNamespace(rows_path=rows_path, manifest_path=manifest_path)
        )

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.review_coincident_queue",
        review,
    )
    cli.main(
        [
            "review-coincident",
            str(deliverables),
            str(cards),
            "--reviewer",
            "Ada Reviewer",
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "deliverables": deliverables,
        "deck": cards,
        "reviewer": "Ada Reviewer",
        "output_directory": output,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {rows_path}" in stdout
    assert f"wrote {manifest_path}" in stdout
