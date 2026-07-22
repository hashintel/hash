"""Exercise the Atlas-native relation-classifier export CLI."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from atlas_tools.relation import cli


def test_cli_exports_the_verified_classifier_in_atlas_format(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    classifier = tmp_path / "classifier"
    closure = tmp_path / "closure"
    resolutions = tmp_path / "resolutions"
    reviews = tmp_path / "reviews"
    deliverables = tmp_path / "deliverables"
    for directory in (classifier, closure, resolutions, reviews, deliverables):
        directory.mkdir()
    soft_labels = tmp_path / "soft-labels.parquet"
    soft_labels.touch()
    output = tmp_path / "classifier.salt"
    captured: dict[str, Path | None] = {}

    def export(**paths: Path | None) -> SimpleNamespace:
        captured.update(paths)
        return SimpleNamespace(path=output)

    monkeypatch.setattr(
        "atlas_tools.relation.evaluation.application.api.export_atlas_classifier",
        export,
    )
    cli.main(
        [
            "export-classifier",
            str(classifier),
            str(closure),
            "--soft-labels",
            str(soft_labels),
            "--resolutions",
            str(resolutions),
            "--coincident-reviews",
            str(reviews),
            "--deliverables",
            str(deliverables),
            "--out",
            str(output),
        ]
    )

    assert captured == {
        "classifier_directory": classifier,
        "closure_directory": closure,
        "output_path": output,
        "soft_labels_path": soft_labels,
        "resolutions_directory": resolutions,
        "coincident_reviews_directory": reviews,
        "deliverables_directory": deliverables,
    }
    assert capsys.readouterr().out == f"wrote {output}\n"
