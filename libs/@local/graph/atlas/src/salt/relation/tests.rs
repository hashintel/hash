#![expect(
    clippy::float_cmp,
    reason = "weight factors are hand-picked exactly representable values (powers of two), so the \
              asserted products and square roots are exact contracts"
)]

use proptest::prelude::*;

use super::{
    ClassProbabilities, Policies, RelationConfidence, RelationIndexes, RelationInstance,
    RelationPolicy,
    artifact::{AttractionArchive, InvalidAttractionIndex, ProtectionArchive},
    attraction::AttractionOptions,
    build,
    error::RelationIndexError,
    protection::{ChannelConfig, NodePair, PairVerdict, ProtectionConfig},
};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId},
    file::WriteInto as _,
};

/// The row domain every fixture spans.
const ROWS: usize = 8;

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
        multiplicity: 1,
    }
}

/// The instance with its link score set.
fn scored(mut base: RelationInstance, link: f32) -> RelationInstance {
    base.confidence.link = Some(link);
    base
}

fn build(
    rows: usize,
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance>,
    attraction: AttractionOptions,
) -> RelationIndexes {
    RelationIndexes::build(
        rows,
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        attraction,
    )
    .expect("the fixture instances satisfy the input contract")
}

fn build_default(policies: &[RelationPolicy], instances: Vec<RelationInstance>) -> RelationIndexes {
    build(ROWS, policies, instances, AttractionOptions::default())
}

fn pair(one: u64, other: u64) -> NodePair {
    NodePair::new(NodeRowId::new(one), NodeRowId::new(other))
}

/// A configuration with the given hard/ordinary floors and thresholds.
fn config(hard: (f32, f32), ordinary: (f32, f32)) -> ProtectionConfig {
    ProtectionConfig::new(
        ChannelConfig::new(hard.0, hard.1).expect("the fixture channel is in domain"),
        ChannelConfig::new(ordinary.0, ordinary.1).expect("the fixture channel is in domain"),
        true,
    )
    .expect("the fixture channels are ordered")
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
    assert_eq!(edges[0].normalization, 0.25);
    // The 0 -> 3 edge sees (1 + 3)(1 + 1) = 8.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the reference narrows to working precision exactly like the contract"
    )]
    let expected = (1.0 / 8.0_f64.sqrt()) as f32;
    assert_eq!(edges[2].normalization, expected);
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
        assert_eq!(group.edges()[0].normalization, 0.5);
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
        ROWS,
        &[policy],
        vec![instance(0, 0, 0, 1)],
        AttractionOptions::new(2.0, 0.0).expect("the fixture settings are in domain"),
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
    // One pair, stored in both of its rows.
    assert_eq!(indexes.protection.view().entries(), 2);
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
        ROWS,
        &[policy],
        vec![
            // Masses 1.0 * 0.5 = 0.5, 0.5 * 0.5 = 0.25, 0.25 * 0.5 = 0.125.
            scored(instance(0, 0, 0, 1), 1.0),
            scored(instance(1, 0, 0, 2), 0.5),
            scored(instance(2, 0, 0, 3), 0.25),
        ],
        AttractionOptions::new(0.0, 0.25).expect("the fixture settings are in domain"),
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
        ROWS,
        &[proximal_policy(0)],
        vec![
            scored(instance(0, 0, 0, 1), 1.0),
            scored(instance(1, 0, 0, 2), 0.0),
            scored(instance(2, 0, 0, 3), 0.0),
            scored(instance(3, 0, 4, 1), 0.0),
            scored(instance(4, 0, 5, 1), 0.0),
        ],
        AttractionOptions::new(0.0, 0.5).expect("the fixture settings are in domain"),
    );

    let edges = indexes.attraction.groups()[0].edges();
    assert_eq!(edges.len(), 1);
    assert_eq!(edges[0].normalization, 0.25);
    assert_eq!(indexes.evidence.pruned_edges, 4);
}

#[test]
fn pruning_never_reaches_protection() {
    // An instance pruned from attraction still protects its pair.
    let indexes = build(
        ROWS,
        &[proximal_policy(0)],
        vec![scored(instance(0, 0, 0, 1), 0.25)],
        AttractionOptions::new(0.0, 0.5).expect("the fixture settings are in domain"),
    );

    assert_eq!(indexes.attraction.edges(), 0);
    assert!(indexes.attraction.groups().is_empty());
    let evidence = indexes
        .protection
        .view()
        .get(pair(0, 1))
        .expect("the pruned instance's pair is protected");
    assert_eq!(evidence.discounted, 0.25);
    assert_eq!(evidence.undiscounted, 0.25);
}

#[test]
fn evidence_components_aggregate_independently_by_maximum() {
    // Two parallel links: the high-applicability link wins the
    // discounted component (0.75 * 0.5 = 0.375 against 0.25 * 1.0),
    // the high-evidence link the undiscounted one (1.0 against 0.5).
    // Under a 0.5 floor the mass is max(0.375, 0.5 * 1.0) = 0.5.
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
    let indexes = build_default(&policies, vec![instance(0, 0, 0, 1), instance(1, 1, 0, 1)]);

    let evidence = indexes
        .protection
        .view()
        .get(pair(0, 1))
        .expect("the linked pair is present");
    assert_eq!(evidence.discounted, 0.375);
    assert_eq!(evidence.undiscounted, 1.0);
    assert_eq!(evidence.mass(0.0), 0.375);
    assert_eq!(evidence.mass(0.5), 0.5);
    assert_eq!(evidence.mass(1.0), 1.0);
}

#[test]
fn protection_ignores_link_direction() {
    let indexes = build_default(
        &[proximal_policy(0)],
        vec![instance(0, 0, 0, 1), instance(1, 0, 1, 0)],
    );

    // Two opposite-direction links, one pair, stored in both rows.
    assert_eq!(indexes.protection.view().entries(), 2);
    assert!(indexes.protection.view().get(pair(1, 0)).is_some());
}

#[test]
fn every_pair_is_visible_from_both_rows() {
    let indexes = build_default(
        &[proximal_policy(0)],
        vec![instance(0, 0, 0, 1), instance(1, 0, 2, 1)],
    );

    let view = indexes.protection.view();
    let partners = |row: u64| -> Vec<u64> {
        view.row(NodeRowId::new(row))
            .map(|entry| entry.partner.get())
            .collect()
    };
    assert_eq!(partners(0), vec![1]);
    assert_eq!(partners(1), vec![0, 2]);
    assert_eq!(partners(2), vec![1]);
    assert_eq!(partners(3), Vec::<u64>::new());
}

#[test]
fn judge_compares_floored_masses_against_thresholds() {
    let indexes = build_default(&[proximal_policy(0)], vec![instance(0, 0, 0, 1)]);
    let view = indexes.protection.view();

    // The unscored full-applicability instance's evidence is (1, 1).
    assert_eq!(
        view.judge(pair(0, 1), config((0.0, 1.0), (0.0, 1.0))),
        PairVerdict {
            hard: true,
            ordinary: true,
        },
    );
    assert_eq!(
        view.judge(pair(0, 1), config((0.0, 1.5), (0.0, 2.0))),
        PairVerdict::UNPROTECTED,
    );

    let hard_only =
        ProtectionConfig::new(ChannelConfig::default(), ChannelConfig::default(), false)
            .expect("default channels are ordered");
    assert_eq!(
        view.judge(pair(0, 1), hard_only),
        PairVerdict {
            hard: true,
            ordinary: false,
        },
    );

    // A pair without link evidence is unprotected under any settings.
    assert_eq!(
        view.judge(pair(0, 2), ProtectionConfig::default()),
        PairVerdict::UNPROTECTED,
    );
}

#[test]
fn floors_rescue_low_applicability_relations_at_query_time() {
    // An unfamiliar relation: strong link evidence, applicability 0.25.
    let policy = RelationPolicy {
        applicability: 0.25,
        ..proximal_policy(0)
    };
    let indexes = build(
        ROWS,
        &[policy],
        vec![instance(0, 0, 0, 1)],
        AttractionOptions::default(),
    );
    let view = indexes.protection.view();

    // At floor 0 the discounted evidence 0.25 misses the 0.5 threshold;
    // a 0.5 floor lifts the same stored pair over it. One index serves
    // both floor cells.
    assert_eq!(
        view.judge(pair(0, 1), config((0.0, 0.5), (0.0, 0.5))),
        PairVerdict::UNPROTECTED,
    );
    assert_eq!(
        view.judge(pair(0, 1), config((0.5, 0.5), (0.5, 0.5))),
        PairVerdict {
            hard: true,
            ordinary: true,
        },
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
    assert_eq!(indexes.protection.view().entries(), 2);
    assert!(indexes.protection.view().get(pair(0, 0)).is_none());
}

#[test]
fn empty_instances_build_empty_indexes() {
    let indexes = build_default(&[proximal_policy(0)], Vec::new());

    assert!(indexes.attraction.groups().is_empty());
    assert_eq!(indexes.protection.view().entries(), 0);
    assert_eq!(indexes.protection.view().rows(), ROWS);
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
        ROWS,
        Policies::new(&policies).expect("the fixture policies are certified"),
        &mut [instance(0, 7, 0, 1)],
        AttractionOptions::default(),
    );
    assert_eq!(
        result.expect_err("relation 7 has no policy"),
        RelationIndexError::MissingPolicy {
            relation: OntologyRowId::new(7),
        },
    );
}

#[test]
fn row_domains_beyond_the_column_encoding_are_rejected() {
    let policies = [proximal_policy(0)];
    let result = RelationIndexes::build(
        1 << 33,
        Policies::new(&policies).expect("the fixture policies are certified"),
        &mut [],
        AttractionOptions::default(),
    );
    assert_eq!(
        result.expect_err("2^33 rows exceed the u32 column encoding"),
        RelationIndexError::TooManyRows { rows: 1 << 33 },
    );
}

#[test]
fn option_constructors_reject_out_of_domain_settings() {
    assert!(AttractionOptions::new(-1.0, 0.0).is_none());
    assert!(AttractionOptions::new(f32::NAN, 0.0).is_none());
    assert!(AttractionOptions::new(0.0, f32::INFINITY).is_none());
    assert!(AttractionOptions::new(4.0, 0.01).is_some());

    assert!(ChannelConfig::new(1.5, 0.0).is_none());
    assert!(ChannelConfig::new(f32::NAN, 0.0).is_none());
    assert!(ChannelConfig::new(0.0, -1.0).is_none());
    assert!(ChannelConfig::new(0.0, f32::NAN).is_none());
    let low = ChannelConfig::new(0.25, 0.5).expect("the channel is in domain");
    let high = ChannelConfig::new(0.5, 0.25).expect("the channel is in domain");

    // Hard wants the higher floor and the lower threshold.
    assert!(ProtectionConfig::new(low, high, true).is_none());
    assert!(ProtectionConfig::new(high, low, true).is_some());
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

    let indexes = build(
        nodes,
        &[proximal_policy(0)],
        instances,
        AttractionOptions::default(),
    );

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
        assert_eq!(edge.normalization, expected, "edge {position}");
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
    let (one_protection, other_protection) = (one.protection.matrix(), other.protection.matrix());
    assert_eq!(
        one_protection.indptr().raw_storage(),
        other_protection.indptr().raw_storage(),
    );
    assert_eq!(one_protection.indices(), other_protection.indices());
    assert_eq!(one_protection.data(), other_protection.data());
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
                    multiplicity: 1,
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

        let kept = instances.clone();
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

        // The protection matrix mirrors every pair into both rows and
        // stores each row's partners strictly ascending without self
        // references.
        let view = forward.protection.view();
        let mut mirrored = 0;
        for row in 0..ROWS as u64 {
            let row = NodeRowId::new(row);
            let partners: Vec<u64> = view.row(row).map(|entry| entry.partner.get()).collect();
            prop_assert!(partners.is_sorted_by(|one, other| one < other));
            prop_assert!(partners.iter().all(|&partner| partner != row.get()));
            for entry in view.row(row) {
                let evidence = view
                    .get(NodePair::new(row, entry.partner))
                    .expect("the mirrored direction stores the pair");
                prop_assert_eq!(evidence, entry.evidence);
                mirrored += 1;
            }
        }
        prop_assert_eq!(mirrored, view.entries());

        // The floor identity is exact: the stored two-component
        // evidence reproduces every floored per-instance mass. The
        // reference deliberately applies the floor inside the
        // per-instance maximum, the form the identity factorizes.
        for floor in [0.0_f32, 0.25, 0.5, 1.0] {
            for row in 0..ROWS as u64 {
                for entry in view.row(NodeRowId::new(row)) {
                    let expected = forward_reference_mass(
                        &kept,
                        &policies,
                        NodePair::new(NodeRowId::new(row), entry.partner),
                        floor,
                    );
                    prop_assert_eq!(entry.evidence.mass(floor), expected);
                }
            }
        }
    }
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
fn a_published_index_reopens_mapped() {
    let dir =
        std::env::temp_dir().join(format!("hash-graph-atlas-relation-{}", std::process::id()));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let policy = RelationPolicy {
        applicability: 0.25,
        ..proximal_policy(0)
    };
    let indexes = build_default(
        &[policy],
        vec![
            scored(instance(0, 0, 0, 1), 0.5),
            instance(1, 0, 2, 1),
            instance(2, 0, 3, 4),
        ],
    );

    let mut bytes = Vec::new();
    let digest = indexes
        .protection
        .write_into(&mut bytes)
        .expect("writing to a buffer succeeds");
    let path = dir.join("protection.sprs");
    std::fs::write(&path, &bytes).expect("the file writes");

    let mapped = ProtectionArchive::new(
        crate::file::sprs::read::SprsFile::open(&path).expect("the written file reopens"),
    )
    .expect("the published index validates");

    // The mapped view serves the same evidence and verdicts as the
    // resident index it was written from.
    let (resident, mapped) = (indexes.protection.view(), mapped.view());
    assert_eq!(resident.rows(), mapped.rows());
    assert_eq!(resident.entries(), mapped.entries());
    for row in 0..ROWS as u64 {
        let row = NodeRowId::new(row);
        let resident_row: Vec<_> = resident.row(row).collect();
        let mapped_row: Vec<_> = mapped.row(row).collect();
        assert_eq!(resident_row, mapped_row);
    }
    let settings = config((0.5, 0.25), (0.0, 0.25));
    for pair in [pair(0, 1), pair(1, 2), pair(3, 4), pair(0, 2)] {
        assert_eq!(resident.judge(pair, settings), mapped.judge(pair, settings),);
    }

    // The digest is the written bytes' identity.
    let mut hasher = crate::integrity::Sha256::new();
    crate::integrity::Update::update(&mut hasher, &bytes);
    assert_eq!(
        digest,
        hasher.finalize(),
        "the returned digest hashes the written bytes",
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
fn a_published_attraction_index_reopens_mapped() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-attraction-{}",
        std::process::id(),
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    // Two relations with distinct weights; one scored instance so the
    // provenance bits round-trip a non-default value.
    let policies = [
        RelationPolicy {
            attraction: ClassProbabilities {
                coincident: 0.5,
                proximal: 0.5,
            },
            ..proximal_policy(3)
        },
        proximal_policy(9),
    ];
    let indexes = build(
        ROWS,
        &policies,
        vec![
            scored(instance(0, 3, 0, 1), 0.5),
            instance(1, 3, 2, 3),
            instance(2, 9, 0, 2),
        ],
        AttractionOptions::new(1.0, 0.0).expect("the fixture options are valid"),
    );

    let mut bytes = Vec::new();
    let digest = indexes
        .attraction
        .write_into(ROWS as u64, &mut bytes)
        .expect("writing to a buffer succeeds");
    let path = dir.join("attraction.atrc");
    std::fs::write(&path, &bytes).expect("the file writes");

    let mapped = AttractionArchive::new(
        crate::file::attraction::read::AttractionFile::open(&path)
            .expect("the written file reopens"),
    )
    .expect("the published index validates");

    // The mapped view serves the same groups, weights, and edges as
    // the resident index it was written from.
    assert_eq!(mapped.rows(), ROWS as u64);
    assert_eq!(mapped.group_count(), indexes.attraction.groups().len());
    assert_eq!(mapped.edge_count(), indexes.attraction.edges());
    for (index, resident) in indexes.attraction.groups().iter().enumerate() {
        let group = mapped.group(index);
        assert_eq!(group.relation(), resident.relation());
        assert_eq!(group.weights(), resident.weights());
        assert_eq!(group.len(), resident.edges().len());
        let edges: Vec<_> = group.edges().collect();
        assert_eq!(edges, resident.edges());
        assert_eq!(group.edge(0), resident.edges()[0]);
    }

    // The digest is the written bytes' identity.
    let mut hasher = crate::integrity::Sha256::new();
    crate::integrity::Update::update(&mut hasher, &bytes);
    assert_eq!(
        digest,
        hasher.finalize(),
        "the returned digest hashes the written bytes",
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg_attr(
    miri,
    ignore = "whole-file mappings go through FFI Miri cannot execute"
)]
#[expect(
    clippy::little_endian_bytes,
    reason = "the corrupted fields are pinned to the format's canonical little-endian bytes"
)]
fn a_corrupted_attraction_file_names_its_broken_invariant() {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-attraction-corrupt-{}",
        std::process::id(),
    ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("the temp directory is writable");

    let indexes = build_default(
        &[proximal_policy(3), proximal_policy(9)],
        vec![
            instance(0, 3, 0, 1),
            instance(1, 3, 2, 3),
            instance(2, 9, 0, 2),
        ],
    );
    let mut bytes = Vec::new();
    indexes
        .attraction
        .write_into(ROWS as u64, &mut bytes)
        .expect("writing to a buffer succeeds");

    let open = |name: &str, bytes: &[u8]| {
        let path = dir.join(name);
        std::fs::write(&path, bytes).expect("the file writes");
        AttractionArchive::new(
            crate::file::attraction::read::AttractionFile::open(&path)
                .expect("the corrupted geometry still parses"),
        )
    };

    // The pristine bytes validate.
    open("pristine.atrc", &bytes).expect("the pristine bytes validate");

    // Group records start at 4096, 32 bytes each, relation first;
    // lowering the second group's relation below the first breaks the
    // ascending order while leaving the ranges intact.
    let mut unordered = bytes.clone();
    unordered[4096 + 32..4096 + 40].copy_from_slice(&1_u64.to_le_bytes());
    assert_eq!(
        open("unordered.atrc", &unordered).expect_err("unordered relations are invalid"),
        InvalidAttractionIndex::UnorderedRelations { group: 1 },
    );

    // Pointing the second group's range past the edge region breaks
    // the range partition.
    let mut oversized = bytes.clone();
    oversized[4096 + 32 + 8..4096 + 32 + 16].copy_from_slice(&99_u64.to_le_bytes());
    assert_eq!(
        open("oversized.atrc", &oversized).expect_err("an oversized range is invalid"),
        InvalidAttractionIndex::BrokenEdgeRanges { group: 1 },
    );

    // Edge records live at 8192 (one group unit past the header);
    // pointing an edge's source row outside the corpus domain fails
    // the row check. The source field sits 8 bytes into the record.
    let mut orphaned = bytes.clone();
    orphaned[8192 + 8..8192 + 16].copy_from_slice(&(ROWS as u64).to_le_bytes());
    assert_eq!(
        open("out-of-domain.atrc", &orphaned).expect_err("an out-of-domain row is invalid"),
        InvalidAttractionIndex::RowOutOfDomain { edge: 0 },
    );

    // A confidence above one fails the score check. The confidence
    // field sits 24 bytes into the record.
    let mut confident = bytes.clone();
    confident[8192 + 24..8192 + 28].copy_from_slice(&2.0_f32.to_le_bytes());
    assert_eq!(
        open("confidence.atrc", &confident).expect_err("an out-of-range confidence is invalid"),
        InvalidAttractionIndex::InvalidConfidence { edge: 0 },
    );

    // Unknown provenance bits fail the score check. The scored field
    // sits 32 bytes into the record.
    let mut scored_bits = bytes.clone();
    scored_bits[8192 + 32..8192 + 36].copy_from_slice(&8_u32.to_le_bytes());
    assert_eq!(
        open("scored.atrc", &scored_bits).expect_err("unknown provenance bits are invalid"),
        InvalidAttractionIndex::UnknownScoredBits { edge: 0 },
    );

    // Swapping a group's two edge records breaks the in-group order.
    let mut disordered = bytes.clone();
    disordered.copy_within(8192 + 40..8192 + 80, 8192);
    disordered[8192 + 40..8192 + 80].copy_from_slice(&bytes[8192..8192 + 40]);
    assert_eq!(
        open("disordered.atrc", &disordered).expect_err("swapped edges are invalid"),
        InvalidAttractionIndex::UnorderedEdges { edge: 1 },
    );

    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
}

/// The floored pair mass computed instance by instance, the
/// pre-factorization form of the protection evidence.
fn forward_reference_mass(
    instances: &[RelationInstance],
    policies: &[RelationPolicy],
    pair: NodePair,
    floor: f32,
) -> f32 {
    let mut mass = 0.0_f32;
    for instance in instances {
        if NodePair::new(instance.source, instance.target) != pair
            || instance.source == instance.target
        {
            continue;
        }
        let policy = policies
            .iter()
            .find(|policy| policy.relation == instance.relation)
            .expect("the fixture policies cover every relation");
        let confidence = instance.confidence.effective().value();
        let positive = policy.selected.coincident + policy.selected.proximal;
        mass = mass.max(confidence * positive * policy.applicability.max(floor));
    }
    mass
}

/// The instance carrying `multiplicity` readings of its edge.
fn multi(mut base: RelationInstance, multiplicity: u32) -> RelationInstance {
    base.multiplicity = multiplicity;
    base
}

#[test]
fn a_two_typed_edge_carries_the_mean_of_its_readings_not_the_sum() {
    // One edge read under two relations at multiplicity 2 versus the
    // same two readings as independent single-typed edges: the mixture
    // halves each reading's mass, so the total is the mean. Every
    // factor is a power of two, so the arithmetic is exact.
    let policies = [proximal_policy(0), proximal_policy(1)];
    let mixed = build_default(
        &policies,
        vec![
            multi(instance(0, 0, 1, 2), 2),
            multi(instance(0, 1, 1, 2), 2),
        ],
    );
    let separate = build_default(&policies, vec![instance(0, 0, 1, 2), instance(1, 1, 1, 2)]);

    assert_eq!(
        mixed.evidence.retained_mass,
        separate.evidence.retained_mass / 2.0,
    );

    // Each group holds the reading at half a link's force: share 0.5
    // on the mass and share-weighted degrees 0.5 at both endpoints,
    // so the persisted factor is 0.5 / sqrt(1.5 * 1.5).
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the reference narrows to working precision exactly like the contract"
    )]
    let expected = (0.5 / (1.5_f64 * 1.5).sqrt()) as f32;
    for group in mixed.attraction.groups() {
        let edges = group.edges();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].normalization, expected);
    }
}

#[test]
fn protection_evidence_ignores_multiplicity() {
    // The same pair under one relation, single-typed versus 4-typed:
    // protection aggregates by maximum over undivided evidence, so a
    // fractional reading still fully vetoes.
    let policies = [proximal_policy(0)];
    let single = build_default(&policies, vec![instance(0, 0, 1, 2)]);
    let quartered = build_default(&policies, vec![multi(instance(0, 0, 1, 2), 4)]);

    let evidence = |indexes: &RelationIndexes| {
        indexes
            .protection
            .view()
            .get(pair(1, 2))
            .expect("the fixture pair is protected")
    };
    assert_eq!(evidence(&single), evidence(&quartered));
}

#[test]
fn single_typed_builds_are_unchanged_by_the_share_machinery() {
    // Shares of 1.0 sum to exact integer degrees and multiply masses
    // by exactly 1: the k = 1 path is bit-identical to the pre-share
    // arithmetic. Two edges meet at row 1, so the shared endpoint's
    // degree is 2 and the far endpoints' degrees are 1.
    let policies = [proximal_policy(0)];
    let indexes = build_default(&policies, vec![instance(0, 0, 1, 2), instance(1, 0, 1, 3)]);

    #[expect(
        clippy::cast_possible_truncation,
        reason = "the reference narrows to working precision exactly like the contract"
    )]
    let expected = (1.0 / (3.0_f64 * 2.0).sqrt()) as f32;
    let group = &indexes.attraction.groups()[0];
    for edge in group.edges() {
        assert_eq!(edge.normalization, expected);
    }
    assert_eq!(indexes.evidence.retained_mass, 2.0);
}
