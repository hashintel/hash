"""Pydantic Settings CLI tests for relation-card set operations."""

from pathlib import Path

import pytest

from atlas_tools.relation import cli
from atlas_tools.relation.concat import ConcatPaths


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

    def concat(paths: list[Path], *, out: Path) -> ConcatPaths:  # noqa: ARG001
        raise ValueError("hash mismatch")

    monkeypatch.setattr("atlas_tools.relation.concat.concat_relations", concat)
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["concat", str(existing), "--out", str(tmp_path / "out")])

    assert excinfo.value.code == 1
    assert "Error: hash mismatch" in capsys.readouterr().err
