from dataclasses import dataclass
from pathlib import Path

import pytest

from atlas_tools.relation import cli
from atlas_tools.relation.evaluation.application.api import TargetResolutionPaths


@dataclass(frozen=True, slots=True)
class _ResolutionResult:
    paths: TargetResolutionPaths


@dataclass(frozen=True, slots=True)
class _ClassifierResult:
    metadata_path: Path
    arrays_path: Path
    out_of_fold_path: Path


def test_cli_reviews_ambiguous_targets_and_echoes_artifact(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    soft_labels = tmp_path / "soft-labels.parquet"
    soft_labels.touch()
    cards = tmp_path / "cards"
    cards.mkdir()
    output = tmp_path / "resolutions"
    captured: dict[str, object] = {}

    def review(
        *,
        soft_labels: Path,
        deck: Path,
        reviewer: str,
        output_directory: Path,
    ) -> _ResolutionResult:
        captured.update(
            soft_labels=soft_labels,
            deck=deck,
            reviewer=reviewer,
            output=output_directory,
        )
        return _ResolutionResult(paths=TargetResolutionPaths.in_directory(output_directory))

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.review_ambiguous_targets",
        review,
    )
    cli.main(
        [
            "resolve-ambiguous",
            str(soft_labels),
            str(cards),
            "--reviewer",
            "Ada Reviewer",
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "soft_labels": soft_labels,
        "deck": cards,
        "reviewer": "Ada Reviewer",
        "output": output,
    }
    stdout = capsys.readouterr().out
    assert f"wrote {output / 'target-resolutions.jsonl'}" in stdout
    assert f"wrote {output / 'target-resolutions.manifest.json'}" in stdout


def test_cli_passes_target_resolutions_to_classifier_fit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    soft_labels = tmp_path / "soft-labels.parquet"
    embeddings = tmp_path / "embeddings.parquet"
    config = tmp_path / "grid.yaml"
    for path in (soft_labels, embeddings, config):
        path.touch()
    closure = tmp_path / "closure"
    resolutions = tmp_path / "resolutions"
    closure.mkdir()
    resolutions.mkdir()
    output = tmp_path / "classifier"
    captured: dict[str, object] = {}

    def fit(
        *,
        soft_labels_path: Path,
        embeddings_path: Path,
        closure_directory: Path,
        config_path: Path,
        output_directory: Path,
        resolutions_directory: Path | None,
    ) -> _ClassifierResult:
        captured.update(
            soft_labels=soft_labels_path,
            embeddings=embeddings_path,
            closure=closure_directory,
            config=config_path,
            output=output_directory,
            resolutions=resolutions_directory,
        )
        return _ClassifierResult(
            metadata_path=output_directory / "classifier.json",
            arrays_path=output_directory / "classifier-arrays.npz",
            out_of_fold_path=output_directory / "out-of-fold.parquet",
        )

    monkeypatch.setattr("atlas_tools.relation.evaluation.application.api.fit_classifier", fit)
    cli.main(
        [
            "fit",
            str(soft_labels),
            str(embeddings),
            str(closure),
            str(config),
            "--resolutions",
            str(resolutions),
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "soft_labels": soft_labels,
        "embeddings": embeddings,
        "closure": closure,
        "config": config,
        "output": output,
        "resolutions": resolutions,
    }
