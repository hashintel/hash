use super::*;
use crate::salt::hash::ContentHash;

#[test]
fn selects_only_an_exact_fully_passing_ladder_member() {
    let version = ContentHash::digest(b"eta-domain-v1");
    let selected_report = ContentHash::digest(b"eta-0.5-evaluation");
    let ladder = ConditionLadder::new(
        ConditionDomain::new(0.0, 1.0, version).expect("domain should validate"),
        [
            (0.0, evidence("zero")),
            (
                0.5,
                ConditionEvidence {
                    report: selected_report,
                    ..evidence("middle")
                },
            ),
            (1.0, evidence("one")),
        ],
    )
    .expect("ordered ladder should validate");

    let canonical = ladder
        .select_canonical(0.5)
        .expect("passing evaluated member should select");

    assert_eq!(canonical.condition().get(), 0.5);
    assert_eq!(canonical.domain_version(), version);
    assert_eq!(canonical.evidence(), selected_report);
    assert_eq!(
        ladder.select_canonical(0.25),
        Err(EvaluationError::UnknownCanonical { value: 0.25 })
    );
}

#[test]
fn failed_evidence_cannot_cross_the_materialization_boundary() {
    let mut failed = evidence("failed");
    failed.persistence = false;
    let ladder = ConditionLadder::new(domain(), [(0.0, evidence("zero")), (1.0, failed)])
        .expect("ladder shape should validate");

    assert_eq!(
        ladder.select_canonical(1.0),
        Err(EvaluationError::FailedCanonicalEvidence {
            value: 1.0,
            criterion: "persistence"
        })
    );
}

#[test]
fn condition_order_and_domain_are_strict() {
    assert!(matches!(
        ConditionLadder::new(domain(), [(0.5, evidence("a")), (0.5, evidence("b"))]),
        Err(EvaluationError::UnorderedCondition { index: 1, .. })
    ));
    assert_eq!(
        ConditionLadder::new(domain(), [(-0.1, evidence("a")), (0.5, evidence("b"))]),
        Err(EvaluationError::ConditionOutOfDomain {
            index: 0,
            value: -0.1
        })
    );
}

fn domain() -> ConditionDomain {
    ConditionDomain::new(0.0, 1.0, ContentHash::digest(b"domain"))
        .expect("fixture domain should validate")
}

fn evidence(name: &str) -> ConditionEvidence {
    ConditionEvidence {
        monotonicity: true,
        distinguishability: true,
        semantic_fidelity: true,
        persistence: true,
        task_evidence: true,
        report: ContentHash::digest(name.as_bytes()),
    }
}
