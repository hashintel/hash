import hashlib
from pathlib import Path
from threading import Event
from typing import Literal

import pytest
import trio

import atlas_tools.relation.evaluation.application.policy_visualization as visualization_module
from atlas_tools.relation.evaluation.analysis.api import (
    ApplicabilitySummary,
    CalibrationBin,
    ClassifierPolicyEvaluation,
    ClassifierWithoutGold,
    CoincidentGate,
    ConfusionRow,
    FamilyVoteEconomics,
    GoldAgreement,
    JudgeHealth,
    JudgeHealthWithoutGold,
    PlacementClassMetrics,
    PolicyReport,
    PolicyReportWithoutGold,
    PolicyVoteEconomics,
    PublishedPolicyReport,
    RateMetric,
    ScalarMetric,
    minimum_feedable_count,
    policy_report_bytes,
    render_published_policy_report_markdown,
    wilson_lower_bound,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    canonical_json_bytes,
    sha256_bytes,
)
from atlas_tools.relation.evaluation.application._policy_report_metadata import (
    POLICY_REPORT_ALGORITHMS,
    REPORT_JSON_FILENAME,
    REPORT_MARKDOWN_FILENAME,
    REPORT_METADATA_FILENAME,
    PolicyReportMetadata,
    policy_report_schema_hashes,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import hash_mapping
from atlas_tools.relation.evaluation.application.policy_report import PolicyReportArtifact
from atlas_tools.relation.evaluation.application.policy_visualization import (
    PolicyVisualizationRun,
    visualize_policy_report,
    visualize_policy_report_async,
)
from atlas_tools.relation.evaluation.domain.api import (
    JudgeFamilyId,
    PlacementClass,
    ReportConfig,
)

_FAMILY_A = JudgeFamilyId("anthropic/model-a")
_FAMILY_B = JudgeFamilyId("openai/model-b")
_GRAPH_NAMES = (
    "classifier-applicability.png",
    "judge-health.png",
    "vote-economics.png",
    "gold-evaluation.png",
    "results-overview.png",
)


def _rate(numerator: int, denominator: int) -> RateMetric:
    return RateMetric(
        state="defined",
        numerator=numerator,
        denominator=denominator,
        value=numerator / denominator,
    )


def _economics() -> PolicyVoteEconomics:
    families = (
        FamilyVoteEconomics(
            family_id=_FAMILY_A,
            imported_votes=2,
            fresh_baseline_votes=6,
            refinement_votes=4,
            abstentions=1,
            total_votes=12,
            known_cost_usd=1.25,
        ),
        FamilyVoteEconomics(
            family_id=_FAMILY_B,
            imported_votes=1,
            fresh_baseline_votes=7,
            refinement_votes=4,
            abstentions=0,
            total_votes=12,
            known_cost_usd=1.75,
        ),
    )
    return PolicyVoteEconomics(
        pool_cards=6,
        refined_cards=2,
        review_queue_cards=1,
        total_votes=24,
        total_known_cost_usd=3.0,
        realized_trigger_rate=2 / 6,
        by_family=families,
    )


def _applicability() -> tuple[ApplicabilitySummary, ...]:
    return (
        ApplicabilitySummary(
            producer="hash",
            cards=2,
            q05=0.3,
            q25=0.5,
            q50=0.7,
            q75=0.8,
            q95=0.9,
        ),
        ApplicabilitySummary(
            producer="wikidata",
            cards=4,
            q05=0.1,
            q25=0.2,
            q50=0.4,
            q75=0.7,
            q95=0.95,
        ),
    )


def _without_gold_report() -> PolicyReportWithoutGold:
    judges = (
        JudgeHealthWithoutGold(
            family_id=_FAMILY_A,
            votes=12,
            abstentions=1,
            abstention_rate=_rate(1, 12),
            initial_schema_compliance=_rate(11, 12),
            parse_repair_rate=_rate(1, 12),
            median_latency_seconds=ScalarMetric(state="defined", observations=12, value=3.2),
            fresh_known_cost_usd=1.25,
        ),
        JudgeHealthWithoutGold(
            family_id=_FAMILY_B,
            votes=12,
            abstentions=0,
            abstention_rate=_rate(0, 12),
            initial_schema_compliance=_rate(12, 12),
            parse_repair_rate=_rate(0, 12),
            median_latency_seconds=ScalarMetric(state="defined", observations=12, value=5.4),
            fresh_known_cost_usd=1.75,
        ),
    )
    return PolicyReportWithoutGold(
        rubric_version="rubric-v1",
        report_config=ReportConfig(calibration_bins=2),
        eligible_cards=6,
        classifier_state="evaluated",
        classifier=ClassifierWithoutGold(
            predictions=6,
            decision_threshold=0.5,
            applicability=_applicability(),
        ),
        judges=judges,
        economics=_economics(),
    )


def _class_metrics(placement_class: PlacementClass) -> PlacementClassMetrics:
    return PlacementClassMetrics(
        placement_class=placement_class,
        gold_support=1,
        predicted=1,
        correct=1,
        precision=_rate(1, 1),
        recall=_rate(1, 1),
    )


def _agreement(source: Literal["panel", "classifier"]) -> GoldAgreement:
    return GoldAgreement(
        source=source,
        decision_threshold=None if source == "panel" else 0.5,
        gold_cards=3,
        post_exposure_excluded=0,
        independent_gold_cards=3,
        independent_unclear=0,
        placement_gold_cards=3,
        no_calls=0,
        agreement=_rate(3, 3),
        per_class=(
            _class_metrics("coincident"),
            _class_metrics("proximal"),
            _class_metrics("overlay"),
        ),
        confusion=(
            ConfusionRow(gold="coincident", coincident=1, proximal=0, overlay=0, no_call=0),
            ConfusionRow(gold="proximal", coincident=0, proximal=1, overlay=0, no_call=0),
            ConfusionRow(gold="overlay", coincident=0, proximal=0, overlay=1, no_call=0),
            ConfusionRow(gold="unclear", coincident=0, proximal=0, overlay=0, no_call=0),
        ),
    )


def _with_gold_report() -> PolicyReport:
    config = ReportConfig(calibration_bins=2)
    classifier = ClassifierPolicyEvaluation(
        predictions=6,
        decision_threshold=0.5,
        gold=_agreement("classifier"),
        calibration=(
            CalibrationBin(
                lower=0.0,
                upper=0.5,
                upper_inclusive=False,
                count=0,
                mean_confidence=ScalarMetric(state="empty-bin", observations=0, value=None),
                accuracy=RateMetric(state="empty-bin", numerator=0, denominator=0, value=None),
            ),
            CalibrationBin(
                lower=0.5,
                upper=1.0,
                upper_inclusive=True,
                count=3,
                mean_confidence=ScalarMetric(state="defined", observations=3, value=0.9),
                accuracy=_rate(3, 3),
            ),
        ),
        applicability=_applicability(),
    )
    judges = tuple(
        JudgeHealth(
            family_id=row.family_id,
            votes=row.total_votes,
            abstentions=row.abstentions,
            abstention_rate=_rate(row.abstentions, row.total_votes),
            initial_schema_compliance=_rate(row.total_votes - 1, row.total_votes),
            parse_repair_rate=_rate(1, row.total_votes),
            gold_votes=3,
            gold_agreement=_rate(3, 3),
            median_latency_seconds=ScalarMetric(
                state="defined", observations=row.total_votes, value=4.0
            ),
            fresh_known_cost_usd=row.known_cost_usd,
        )
        for row in _economics().by_family
    )
    minimum = minimum_feedable_count(
        config.coincident_precision_target,
        confidence=config.confidence_level,
    )
    return PolicyReport(
        rubric_version="rubric-v1",
        report_config=config,
        eligible_cards=6,
        gold_cards=3,
        gold_post_exposure=0,
        panel_gold=_agreement("panel"),
        classifier_state="evaluated",
        classifier=classifier,
        coincident_gate=CoincidentGate(
            source="classifier",
            decision_threshold=0.5,
            stratum_size=1,
            correct=1,
            precision=_rate(1, 1),
            wilson_state="defined",
            wilson_lcb=wilson_lower_bound(1, 1, confidence=config.confidence_level),
            precision_target=config.coincident_precision_target,
            confidence_level=config.confidence_level,
            minimum_zero_error_count=minimum,
            sample_size_state="insufficient",
            verdict="insufficient-sample",
        ),
        judges=judges,
        economics=_economics(),
    )


def _write_report(directory: Path, report: PublishedPolicyReport) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    report_json = policy_report_bytes(report)
    report_markdown = render_published_policy_report_markdown(report).encode("ascii")
    gold_evaluated = isinstance(report, PolicyReport)
    source_hashes = {"grid/cards.jsonl": "a" * 64}
    if gold_evaluated:
        source_hashes["gold.jsonl"] = "b" * 64
    metadata = PolicyReportMetadata(
        schema_hashes=policy_report_schema_hashes(report.schema_version),
        algorithms=POLICY_REPORT_ALGORITHMS,
        algorithm_hash=hash_mapping(POLICY_REPORT_ALGORITHMS),
        source_hashes=source_hashes,
        content_hashes={
            REPORT_JSON_FILENAME: sha256_bytes(report_json),
            REPORT_MARKDOWN_FILENAME: sha256_bytes(report_markdown),
        },
        report_schema_version=report.schema_version,
        gold_state="evaluated" if gold_evaluated else "not-provided",
        gold_rows=report.gold_cards if gold_evaluated else None,
        classifier_state=report.classifier_state,
    )
    (directory / REPORT_JSON_FILENAME).write_bytes(report_json)
    (directory / REPORT_MARKDOWN_FILENAME).write_bytes(report_markdown)
    (directory / REPORT_METADATA_FILENAME).write_bytes(canonical_json_bytes(metadata) + b"\n")
    return directory


@pytest.fixture(scope="module")
def report_directory(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return _write_report(tmp_path_factory.mktemp("policy-report-source"), _without_gold_report())


@pytest.fixture(scope="module")
def visualization(
    report_directory: Path,
    tmp_path_factory: pytest.TempPathFactory,
) -> PolicyVisualizationRun:
    return visualize_policy_report(
        report_directory,
        tmp_path_factory.mktemp("policy-report-visualization"),
    )


def _outputs(run: PolicyVisualizationRun) -> tuple[Path, ...]:
    return (*run.graphs, run.explainer_md, run.report_pdf, run.report_html)


def test_policy_visualization_publishes_source_bound_canonical_outputs(
    visualization: PolicyVisualizationRun,
) -> None:
    assert tuple(path.name for path in visualization.graphs) == _GRAPH_NAMES
    assert visualization.explainer_md.name == "results-overview.md"
    assert visualization.report_pdf.name == "results-report.pdf"
    assert visualization.report_html.name == "results-report.html"

    outputs = _outputs(visualization)
    source = visualization.report_metadata_hash.encode("ascii")
    assert all(source in path.read_bytes() for path in outputs)
    assert all(path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") for path in visualization.graphs)
    assert visualization.report_pdf.read_bytes().startswith(b"%PDF-")
    assert visualization.explainer_md.read_bytes().isascii()
    assert visualization.report_html.read_bytes().isascii()
    assert dict(visualization.content_hashes) == {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in outputs
    }
    assert b"Gold: not provided" in visualization.explainer_md.read_bytes()
    assert b"Gold cards: 0" not in visualization.explainer_md.read_bytes()


def test_policy_visualization_is_byte_deterministic(
    report_directory: Path,
    visualization: PolicyVisualizationRun,
    tmp_path: Path,
) -> None:
    rendered = visualize_policy_report(report_directory, tmp_path)
    assert dict(rendered.content_hashes) == dict(visualization.content_hashes)


def test_async_policy_visualization_uses_a_responsive_worker(
    report_directory: Path,
    visualization: PolicyVisualizationRun,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered = Event()
    release = Event()

    def block_worker(_artifact: PolicyReportArtifact, _output: Path) -> PolicyVisualizationRun:
        entered.set()
        if not release.wait(timeout=5):
            raise TimeoutError("test did not release the visualization worker")
        return visualization

    monkeypatch.setattr(visualization_module, "_visualize", block_worker)

    async def scenario() -> PolicyVisualizationRun:
        results: list[PolicyVisualizationRun] = []

        async def render() -> None:
            results.append(await visualize_policy_report_async(report_directory, tmp_path))

        async with trio.open_nursery() as nursery:
            nursery.start_soon(render)
            with trio.fail_after(5):
                while not entered.is_set():
                    await trio.lowlevel.checkpoint()
            release.set()
        assert len(results) == 1
        return results[0]

    assert trio.run(scenario) is visualization


def test_policy_visualization_renders_gold_backed_evidence(tmp_path: Path) -> None:
    report_directory = _write_report(tmp_path / "report", _with_gold_report())
    rendered = visualize_policy_report(report_directory, tmp_path / "visualization")

    assert b"Gold: evaluated (3 rows" in rendered.explainer_md.read_bytes()
    assert b"<span>Gold</span><strong>evaluated</strong>" in rendered.report_html.read_bytes()
    assert rendered.graphs[3].name == "gold-evaluation.png"
