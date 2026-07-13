import pytest

from atlas_tools.relation.eval.schema import Estimate, Verdict
from atlas_tools.relation.eval.statistics import (
    bootstrap_cohen_kappa,
    bootstrap_krippendorff_alpha,
    bootstrap_mean,
    cluster_bootstrap,
    cohen_kappa,
    krippendorff_alpha,
    mean,
    median,
    normalized_entropy,
    quantile,
    rate,
)


def test_scalar_statistics_have_hand_computed_values() -> None:
    assert mean([1.0, 2.0, 6.0]) == 3.0
    assert rate([True, False, True, True]) == 0.75
    assert quantile([0.0, 10.0], q=0.25) == 2.5
    assert median([3.0, 1.0, 2.0]) == 2.0
    assert normalized_entropy([]) is None
    assert normalized_entropy(["coincident", "coincident", "proximal", "proximal"]) == 0.5
    assert normalized_entropy(["coincident", "proximal", "overlay", "unclear"]) == 1.0


def test_cohen_kappa_matches_hand_computation() -> None:
    pairs: list[tuple[Verdict, Verdict]] = [
        ("coincident", "coincident"),
        ("coincident", "proximal"),
        ("proximal", "proximal"),
        ("proximal", "proximal"),
    ]

    # Observed agreement is 3/4 and chance agreement is 1/2.
    assert cohen_kappa(pairs) == 0.5


def test_nominal_krippendorff_alpha_matches_hand_computation() -> None:
    ratings: dict[str, list[Verdict]] = {
        "agree": ["coincident", "coincident"],
        "disagree": ["coincident", "proximal"],
        "unpaired": ["unclear"],
    }

    # Observed and expected disagreement are both 1/2; the singleton card is omitted.
    assert krippendorff_alpha(ratings) == 0.0


def test_degenerate_agreement_is_undefined_with_bootstrap_diagnostics() -> None:
    assert cohen_kappa([("coincident", "coincident")]) is None
    assert krippendorff_alpha({"a": ["overlay", "overlay"], "b": ["overlay"]}) is None
    assert bootstrap_cohen_kappa({"a": [("coincident", "coincident")]}) == Estimate(
        est=None,
        lo=None,
        hi=None,
        n=1,
        bootstrap_resamples=1000,
        bootstrap_defined=0,
    )
    assert bootstrap_krippendorff_alpha({"a": ["overlay", "overlay"]}) == Estimate(
        est=None,
        lo=None,
        hi=None,
        n=1,
        bootstrap_resamples=1000,
        bootstrap_defined=0,
    )


def test_empty_bootstrap_is_all_null_and_records_requested_draws() -> None:
    assert cluster_bootstrap({}, mean) == Estimate(
        est=None,
        lo=None,
        hi=None,
        n=0,
        bootstrap_resamples=1000,
        bootstrap_defined=0,
    )


def test_bootstrap_is_seeded_and_independent_of_mapping_order() -> None:
    forward = {"card-b": [5.0, 7.0], "card-a": [1.0]}
    reverse = {"card-a": [1.0], "card-b": [5.0, 7.0]}

    first = bootstrap_mean(forward)
    second = bootstrap_mean(reverse)

    assert first == second
    assert first == bootstrap_mean(forward)
    assert first.est == pytest.approx(13 / 3)
    assert first.n == 3
    assert first.bootstrap_resamples == 1000
    assert first.bootstrap_defined == 1000


def test_bootstrap_resamples_cards_not_individual_votes() -> None:
    observations = {
        "one-zero-vote": [0.0],
        "nine-one-votes": [1.0] * 9,
    }

    estimate = bootstrap_mean(observations)

    # A two-card bootstrap can draw the zero card twice or the one card twice, producing the
    # endpoints. Resampling ten individual votes would instead concentrate near the 0.9 mean.
    assert estimate == Estimate(
        est=0.9,
        lo=0.0,
        hi=1.0,
        n=10,
        bootstrap_resamples=1000,
        bootstrap_defined=1000,
    )


def test_bootstrap_reports_defined_and_requested_draws_separately() -> None:
    estimate = bootstrap_cohen_kappa(
        {
            "degenerate-if-doubled": [("coincident", "coincident")],
            "always-defined": [("coincident", "proximal")],
        }
    )

    assert estimate.est == 0.0
    assert estimate.lo == 0.0
    assert estimate.hi == 0.0
    assert estimate.bootstrap_resamples == 1000
    assert 0 < estimate.bootstrap_defined < estimate.bootstrap_resamples


def test_alpha_bootstrap_counts_pairable_cards_and_defined_draws() -> None:
    estimate = bootstrap_krippendorff_alpha(
        {
            "agree": ["coincident", "coincident"],
            "disagree": ["coincident", "proximal"],
            "unpaired": ["unclear"],
        }
    )

    assert estimate.est == 0.0
    assert estimate.n == 2
    assert estimate.bootstrap_resamples == 1000
    assert 0 < estimate.bootstrap_defined < estimate.bootstrap_resamples
