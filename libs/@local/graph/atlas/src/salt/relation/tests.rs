#![expect(
    clippy::float_cmp,
    reason = "weight factors are hand-picked exactly representable values (powers of two), so the \
              asserted products and square roots are exact contracts"
)]

use proptest::prelude::*;

use super::{
    ClassProbabilities, Policies, RelationConfidence, RelationIndexes, RelationInstance,
    RelationPolicy,
    attraction::AttractionOptions,
    build,
    error::RelationIndexError,
    protection::{AdmissionThresholds, NodePair, PairVerdict, ProtectionOptions},
};
use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};

/// A neutral policy: full Proximal attraction, full applicability, unit
/// strength.
fn proximal_policy(relation: u64) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(relation),
        attraction: ClassProbabilities {
            coincident: 0.0,
            proximal: 1.0,
        },
        selected: ClassProbabilities {
            coincident: 0.0,
            proximal: 1.0,
        },
        applicability: 1.0,
        strength: 1.0,
    }
}

/// An unscored instance of `relation` between `source` and `target`.
fn instance(edge: u64, relation: u64, source: u64, target: u64) -> RelationInstance {
    RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(relation),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        confidence: RelationConfidence::default(),
    }
}

/// The instance with its link score set.
fn scored(mut base: RelationInstance, link: f32) -> RelationInstance {
    base.confidence.link = Some(link);
    base
}

fn build(
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance>,
    attraction: AttractionOptions,
    protection: ProtectionOptions,
) -> RelationIndexes {
    RelationIndexes::build(
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        attraction,
        protection,
    )
    .expect("the fixture instances satisfy the input contract")
}

fn build_default(policies: &[RelationPolicy], instances: Vec<RelationInstance>) -> RelationIndexes {
    build(
        policies,
        instances,
        AttractionOptions::default(),
        ProtectionOptions::default(),
    )
}

fn pair(one: u64, other: u64) -> NodePair {
    NodePair::new(NodeRowId::new(one), NodeRowId::new(other))
}

#[test]
fn effective_confidence_combines_scores_exactly() {
    // 0.5 * sqrt(0.25 * 0.25): every factor is a power of two, so the
    // product 0.125 is exact.
    let confidence = RelationConfidence {
        link: Some(0.5),
        source: Some(0.25),
        target: Some(0.25),
    };
    let effective = confidence.effective();
    assert_eq!(effective.value(), 0.125);
    assert!(effective.scored().link());
    assert!(effective.scored().source());
    assert!(effective.scored().target());
}

#[test]
fn unscored_confidences_are_neutral_with_provenance() {
    let effective = RelationConfidence::default().effective();
    assert_eq!(effective.value(), 1.0);
    assert!(!effective.scored().link());
    assert!(!effective.scored().source());
    assert!(!effective.scored().target());

    let partial = RelationConfidence {
        link: None,
        source: Some(0.25),
        target: None,
    }
    .effective();
    assert_eq!(partial.value(), 0.5);
    assert!(!partial.scored().link());
    assert!(partial.scored().source());
    assert!(!partial.scored().target());
}

#[test]
fn degree_normalization_counts_the_relations_complete_instance_set() {
    // Node 0 sources three instances and node 1 receives three, so the
    // 0 -> 1 edge sees (1 + 3)(1 + 3) = 16 and nu = 0.25 exactly.
    let indexes = build_default(
        &[proximal_policy(0)],
        vec![
            instance(0, 0, 0, 1),
            instance(1, 0, 0, 2),
            instance(2, 0, 0, 3),
            instance(3, 0, 4, 1),
            instance(4, 0, 5, 1),
        ],
    );

    let groups = indexes.attraction.groups();
    assert_eq!(groups.len(), 1);
    let edges = groups[0].edges();
    assert_eq!(edges.len(), 5);
    assert_eq!(edges[0].source, NodeRowId::new(0));
    assert_eq!(edges[0].target, NodeRowId::new(1));
    assert_eq!(edges[0].degree_normalization, 0.25);
    // The 0 -> 3 edge sees (1 + 3)(1 + 1) = 8.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the reference narrows to working precision exactly like the contract"
    )]
    let expected = (1.0 / 8.0_f64.sqrt()) as f32;
    assert_eq!(edges[2].degree_normalization, expected);
}

#[test]
fn degrees_are_per_relation() {
    // The same endpoints under a second relation contribute nothing to
    // the first relation's degrees: each relation's 0 -> 1 edge sees
    // (1 + 1)(1 + 1) = 4.
    let indexes = build_default(
        &[proximal_policy(0), proximal_policy(1)],
        vec![instance(0, 0, 0, 1), instance(1, 1, 0, 1)],
    );

    for group in indexes.attraction.groups() {
        assert_eq!(group.edges()[0].degree_normalization, 0.5);
    }
}

#[test]
fn group_weights_carry_the_policy_and_coefficient() {
    let policy = RelationPolicy {
        relation: OntologyRowId::new(0),
        attraction: ClassProbabilities {
            coincident: 0.25,
            proximal: 0.5,
        },
        selected: ClassProbabilities {
            coincident: 0.5,
            proximal: 0.25,
        },
        applicability: 1.0,
        strength: 2.0,
    };
    let indexes = build(
        &[policy],
        vec![instance(0, 0, 0, 1)],
        AttractionOptions::new(2.0, 0.0).expect("the fixture settings are in domain"),
        ProtectionOptions::default(),
    );

    let weights = indexes.attraction.groups()[0].weights();
    assert_eq!(weights.coincident, 0.5);
    assert_eq!(weights.proximal, 0.5);
    assert_eq!(weights.strength, 2.0);
    assert_eq!(weights.scale(), 1.0);
}

#[test]
fn groups_ascend_and_edges_sort_within_them() {
    let indexes = build_default(
        &[proximal_policy(0), proximal_policy(2)],
        vec![
            instance(3, 2, 1, 0),
            instance(1, 0, 2, 3),
            instance(0, 0, 2, 1),
            instance(2, 0, 2, 3),
        ],
    );

    let groups = indexes.attraction.groups();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].relation(), OntologyRowId::new(0));
    assert_eq!(groups[1].relation(), OntologyRowId::new(2));

    let sorted: Vec<(u64, u64, u64)> = groups[0]
        .edges()
        .iter()
        .map(|edge| (edge.source.get(), edge.target.get(), edge.edge.get()))
        .collect();
    assert_eq!(sorted, vec![(2, 1, 0), (2, 3, 1), (2, 3, 2)]);
    assert_eq!(indexes.attraction.edges(), 4);
}

#[test]
fn one_edge_row_carries_several_relations() {
    // A multi-typed link is one instance per relation: both groups hold
    // the edge row, and the pair aggregates across relations.
    let indexes = build_default(
        &[proximal_policy(0), proximal_policy(1)],
        vec![instance(0, 0, 0, 1), instance(0, 1, 0, 1)],
    );

    assert_eq!(indexes.attraction.groups().len(), 2);
    assert_eq!(indexes.protection.pairs().len(), 1);
}

#[test]
fn pruning_splits_mass_at_the_threshold_inclusively() {
    let policy = RelationPolicy {
        attraction: ClassProbabilities {
            coincident: 0.0,
            proximal: 0.5,
        },
        ..proximal_policy(0)
    };
    let indexes = build(
        &[policy],
        vec![
            // Masses 1.0 * 0.5 = 0.5, 0.5 * 0.5 = 0.25, 0.25 * 0.5 = 0.125.
            scored(instance(0, 0, 0, 1), 1.0),
            scored(instance(1, 0, 0, 2), 0.5),
            scored(instance(2, 0, 0, 3), 0.25),
        ],
        AttractionOptions::new(0.0, 0.25).expect("the fixture settings are in domain"),
        ProtectionOptions::default(),
    );

    // The mass exactly at the threshold is retained.
    assert_eq!(indexes.evidence.retained_edges, 2);
    assert_eq!(indexes.evidence.pruned_edges, 1);
    assert_eq!(indexes.evidence.retained_mass, 0.75);
    assert_eq!(indexes.evidence.pruned_mass, 0.125);
    assert_eq!(indexes.evidence.omitted_mass_fraction(), 0.125 / 0.875);
    assert_eq!(indexes.attraction.edges(), 2);
}

#[test]
fn pruned_instances_keep_their_degree_contributions() {
    // Every instance but the first prunes at zero confidence, yet the
    // retained 0 -> 1 edge still sees both endpoints at degree 3.
    let indexes = build(
        &[proximal_policy(0)],
        vec![
            scored(instance(0, 0, 0, 1), 1.0),
            scored(instance(1, 0, 0, 2), 0.0),
            scored(instance(2, 0, 0, 3), 0.0),
            scored(instance(3, 0, 4, 1), 0.0),
            scored(instance(4, 0, 5, 1), 0.0),
        ],
        AttractionOptions::new(0.0, 0.5).expect("the fixture settings are in domain"),
        ProtectionOptions::default(),
    );

    let edges = indexes.attraction.groups()[0].edges();
    assert_eq!(edges.len(), 1);
    assert_eq!(edges[0].degree_normalization, 0.25);
    assert_eq!(indexes.evidence.pruned_edges, 4);
}

#[test]
fn pruning_never_reaches_protection() {
    // An instance pruned from attraction still protects its pair.
    let indexes = build(
        &[proximal_policy(0)],
        vec![scored(instance(0, 0, 0, 1), 0.25)],
        AttractionOptions::new(0.0, 0.5).expect("the fixture settings are in domain"),
        ProtectionOptions::default(),
    );

    assert_eq!(indexes.attraction.edges(), 0);
    assert!(indexes.attraction.groups().is_empty());
    let protection = indexes
        .protection
        .get(pair(0, 1))
        .expect("the pruned instance's pair is protected");
    assert_eq!(protection.hard_mass, 0.25);
}

#[test]
fn protection_channels_aggregate_independently_by_maximum() {
    // Two parallel links: under the hard floor of 0.5, the low-
    // applicability link wins the hard channel (max(0.25, 0.5) * 1.0 =
    // 0.5) while the high-applicability link wins the ordinary channel
    // (0.75 * 0.5 = 0.375 against 0.25).
    let policies = [
        RelationPolicy {
            selected: ClassProbabilities {
                coincident: 0.25,
                proximal: 0.25,
            },
            applicability: 0.75,
            ..proximal_policy(0)
        },
        RelationPolicy {
            selected: ClassProbabilities {
                coincident: 0.5,
                proximal: 0.5,
            },
            applicability: 0.25,
            ..proximal_policy(1)
        },
    ];
    let indexes = build(
        &policies,
        vec![instance(0, 0, 0, 1), instance(1, 1, 0, 1)],
        AttractionOptions::default(),
        ProtectionOptions::new(0.5, 0.0).expect("the fixture floors are ordered"),
    );

    let protection = indexes
        .protection
        .get(pair(0, 1))
        .expect("the linked pair is present");
    assert_eq!(protection.hard_mass, 0.5);
    assert_eq!(protection.ordinary_mass, 0.375);
}

#[test]
fn protection_ignores_link_direction() {
    let indexes = build_default(
        &[proximal_policy(0)],
        vec![instance(0, 0, 0, 1), instance(1, 0, 1, 0)],
    );

    assert_eq!(indexes.protection.pairs().len(), 1);
    assert!(indexes.protection.get(pair(1, 0)).is_some());
}

#[test]
fn judge_compares_masses_against_thresholds() {
    let indexes = build_default(&[proximal_policy(0)], vec![instance(0, 0, 0, 1)]);

    // The unscored instance's masses are 1.0 in both channels.
    let strict = AdmissionThresholds::new(1.0, 1.0, true).expect("the thresholds are ordered");
    assert_eq!(
        indexes.protection.judge(pair(0, 1), strict),
        PairVerdict {
            hard: true,
            ordinary: true,
        },
    );

    let unreachable = AdmissionThresholds::new(1.5, 2.0, true).expect("the thresholds are ordered");
    assert_eq!(
        indexes.protection.judge(pair(0, 1), unreachable),
        PairVerdict::UNPROTECTED,
    );

    let hard_only = AdmissionThresholds::new(0.0, 0.0, false).expect("the thresholds are ordered");
    assert_eq!(
        indexes.protection.judge(pair(0, 1), hard_only),
        PairVerdict {
            hard: true,
            ordinary: false,
        },
    );

    // A pair without link evidence is unprotected under any thresholds.
    assert_eq!(
        indexes
            .protection
            .judge(pair(0, 2), AdmissionThresholds::default()),
        PairVerdict::UNPROTECTED,
    );
}

#[test]
fn self_references_are_dropped_and_counted() {
    let indexes = build_default(
        &[proximal_policy(0)],
        vec![instance(0, 0, 0, 0), instance(1, 0, 0, 1)],
    );

    assert_eq!(indexes.evidence.self_references, 1);
    assert_eq!(indexes.attraction.edges(), 1);
    assert_eq!(indexes.protection.pairs().len(), 1);
    assert!(indexes.protection.get(pair(0, 0)).is_none());
}

#[test]
fn empty_instances_build_empty_indexes() {
    let indexes = build_default(&[proximal_policy(0)], Vec::new());

    assert!(indexes.attraction.groups().is_empty());
    assert!(indexes.protection.pairs().is_empty());
    assert_eq!(indexes.evidence.retained_edges, 0);
    assert_eq!(indexes.evidence.omitted_mass_fraction(), 0.0);
}

#[test]
fn policy_tables_certify_order_and_domains() {
    assert_eq!(
        Policies::new(&[proximal_policy(1), proximal_policy(0)])
            .expect_err("descending policies violate the order contract"),
        RelationIndexError::PolicyOrder {
            position: 1,
            relation: OntologyRowId::new(0),
        },
    );

    for policy in [
        RelationPolicy {
            applicability: f32::NAN,
            ..proximal_policy(0)
        },
        RelationPolicy {
            attraction: ClassProbabilities {
                coincident: 1.5,
                proximal: 0.0,
            },
            ..proximal_policy(0)
        },
        RelationPolicy {
            strength: -1.0,
            ..proximal_policy(0)
        },
    ] {
        assert_eq!(
            Policies::new(&[policy]).expect_err("the policy value lies outside its domain"),
            RelationIndexError::PolicyDomain {
                relation: OntologyRowId::new(0),
            },
        );
    }
}

#[test]
fn uncovered_relations_are_rejected() {
    let policies = [proximal_policy(0)];
    let result = RelationIndexes::build(
        Policies::new(&policies).expect("the fixture policies are certified"),
        &mut [instance(0, 7, 0, 1)],
        AttractionOptions::default(),
        ProtectionOptions::default(),
    );
    assert_eq!(
        result.expect_err("relation 7 has no policy"),
        RelationIndexError::MissingPolicy {
            relation: OntologyRowId::new(7),
        },
    );
}

#[test]
fn option_constructors_reject_out_of_domain_settings() {
    assert!(AttractionOptions::new(-1.0, 0.0).is_none());
    assert!(AttractionOptions::new(f32::NAN, 0.0).is_none());
    assert!(AttractionOptions::new(0.0, f32::INFINITY).is_none());
    assert!(AttractionOptions::new(4.0, 0.01).is_some());

    assert!(ProtectionOptions::new(0.25, 0.5).is_none());
    assert!(ProtectionOptions::new(1.5, 0.0).is_none());
    assert!(ProtectionOptions::new(f32::NAN, 0.0).is_none());
    assert!(ProtectionOptions::new(0.5, 0.25).is_some());

    assert!(AdmissionThresholds::new(0.5, 0.25, true).is_none());
    assert!(AdmissionThresholds::new(-1.0, 0.0, true).is_none());
    assert!(AdmissionThresholds::new(0.0, f32::NAN, true).is_none());
    assert!(AdmissionThresholds::new(0.25, 0.5, false).is_some());
}

#[test]
fn a_group_spanning_several_emission_chunks_matches_the_chain_reference() {
    // A chain 0 -> 1 -> ... -> n under one relation forces the group
    // through several fixed emission chunks: source runs cross chunk
    // boundaries, and every degree must still count the whole group.
    let nodes = 3 * build::EMISSION_CHUNK + 7;
    let instances: Vec<RelationInstance> = (0..nodes - 1)
        .map(|link| instance(link as u64, 0, link as u64, link as u64 + 1))
        .collect();

    let indexes = build_default(&[proximal_policy(0)], instances);

    let groups = indexes.attraction.groups();
    assert_eq!(groups.len(), 1);
    let edges = groups[0].edges();
    assert_eq!(edges.len(), nodes - 1);

    // Chain degrees: 1 at both ends, 2 everywhere else. Edge `k`
    // connects rows `k` and `k + 1`.
    for (position, edge) in edges.iter().enumerate() {
        assert_eq!(edge.source, NodeRowId::new(position as u64));
        let left = if position == 0 { 2.0_f64 } else { 3.0 };
        let right = if position == nodes - 2 { 2.0_f64 } else { 3.0 };
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the reference narrows to working precision exactly like the contract"
        )]
        let expected = ((left * right).sqrt().recip()) as f32;
        assert_eq!(edge.degree_normalization, expected, "edge {position}");
    }

    // Every unscored instance carries mass exactly 1.0, so the chunked
    // double-precision partial sums are exact whatever the chunking.
    #[expect(
        clippy::cast_precision_loss,
        reason = "the fixture size sits far below f64 integer precision"
    )]
    let expected_mass = (nodes - 1) as f64;
    assert_eq!(indexes.evidence.retained_mass, expected_mass);
    assert_eq!(indexes.evidence.retained_edges, nodes - 1);
}

/// Asserts two builds produced identical indexes, component by component.
fn assert_indexes_equal(one: &RelationIndexes, other: &RelationIndexes) {
    assert_eq!(one.evidence, other.evidence);
    assert_eq!(one.protection.pairs(), other.protection.pairs());
    assert_eq!(
        one.attraction.groups().len(),
        other.attraction.groups().len()
    );
    for (left, right) in one
        .attraction
        .groups()
        .iter()
        .zip(other.attraction.groups())
    {
        assert_eq!(left.relation(), right.relation());
        assert_eq!(left.weights(), right.weights());
        assert_eq!(left.edges(), right.edges());
    }
}

prop_compose! {
    /// Instances over three relations and eight rows, with unique edge
    /// rows and arbitrary optional scores.
    fn arbitrary_instances()(
        raw in proptest::collection::vec(
            (
                0..3_u64,
                0..8_u64,
                0..8_u64,
                proptest::option::of(0.0_f32..=1.0),
                proptest::option::of(0.0_f32..=1.0),
                proptest::option::of(0.0_f32..=1.0),
            ),
            0..48,
        ),
    ) -> Vec<RelationInstance> {
        raw.into_iter()
            .enumerate()
            .map(|(edge, (relation, source, target, link, source_score, target_score))| {
                RelationInstance {
                    edge: EdgeRowId::new(edge as u64),
                    relation: OntologyRowId::new(relation),
                    source: NodeRowId::new(source),
                    target: NodeRowId::new(target),
                    confidence: RelationConfidence {
                        link,
                        source: source_score,
                        target: target_score,
                    },
                }
            })
            .collect()
    }
}

proptest! {
    /// The build is a function of the instance set, not its order, and
    /// its output orders are the documented invariants.
    #[test]
    fn build_is_order_independent_and_sorted(instances in arbitrary_instances()) {
        let policies = [
            proximal_policy(0),
            RelationPolicy {
                selected: ClassProbabilities {
                    coincident: 0.25,
                    proximal: 0.25,
                },
                applicability: 0.5,
                ..proximal_policy(1)
            },
            RelationPolicy {
                strength: 2.0,
                ..proximal_policy(2)
            },
        ];
        let self_references = instances
            .iter()
            .filter(|instance| instance.source == instance.target)
            .count();

        let mut reversed = instances.clone();
        reversed.reverse();

        let forward = build_default(&policies, instances);
        let backward = build_default(&policies, reversed);
        assert_indexes_equal(&forward, &backward);

        prop_assert_eq!(forward.evidence.self_references, self_references);

        let relations: Vec<u64> = forward
            .attraction
            .groups()
            .iter()
            .map(|group| group.relation().get())
            .collect();
        prop_assert!(relations.is_sorted_by(|one, other| one < other));

        for group in forward.attraction.groups() {
            prop_assert!(!group.edges().is_empty());
            let keys: Vec<(u64, u64, u64)> = group
                .edges()
                .iter()
                .map(|edge| (edge.source.get(), edge.target.get(), edge.edge.get()))
                .collect();
            prop_assert!(keys.is_sorted());
        }

        let pairs: Vec<(u64, u64)> = forward
            .protection
            .pairs()
            .iter()
            .map(|entry| (entry.pair.first().get(), entry.pair.second().get()))
            .collect();
        prop_assert!(pairs.is_sorted_by(|one, other| one < other));
        prop_assert!(pairs.iter().all(|&(first, second)| first < second));
    }
}
