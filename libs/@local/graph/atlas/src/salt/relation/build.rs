//! Construction of both relation indexes from one admitted instance set.

use rayon::prelude::*;

use super::{
    BuildEvidence, RelationIndexes, RelationInstance, RelationPolicy,
    attraction::{
        AttractionEdge, AttractionGroup, AttractionIndex, AttractionOptions, AttractionWeights,
    },
    error::RelationIndexError,
    protection::{NodePair, PairProtection, ProtectionIndex, ProtectionOptions},
};
use crate::dataset::{EdgeRowId, NodeRowId, OntologyRowId};

/// Builds the attraction and protection indexes together.
///
/// See [`RelationIndexes::build`] for the contract; this is its
/// implementation.
pub(super) fn build(
    rows: usize,
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance>,
    attraction: AttractionOptions,
    protection: ProtectionOptions,
) -> Result<RelationIndexes, RelationIndexError> {
    attraction.validate()?;
    protection.validate()?;
    validate_policies(policies)?;
    for instance in &instances {
        validate_instance(instance, rows, policies)?;
    }
    reject_duplicates(&instances)?;

    let submitted = instances.len();
    instances.retain(|instance| instance.source != instance.target);
    let self_references = submitted - instances.len();

    // (relation, edge) is unique past the duplicate check and an edge row
    // fixes its endpoints, so the full key is a total order: the unstable
    // parallel sort is deterministic.
    instances.par_sort_unstable_by_key(|instance| {
        (
            instance.relation.get(),
            instance.source.get(),
            instance.target.get(),
            instance.edge.get(),
        )
    });

    let degrees = Degrees::count(&instances);

    let mut ranges = Vec::new();
    let mut start = 0;
    while start < instances.len() {
        let relation = instances[start].relation.get();
        let length =
            instances[start..].partition_point(|instance| instance.relation.get() == relation);
        ranges.push(start..start + length);
        start += length;
    }

    let built: Vec<(AttractionGroup, GroupEvidence)> = ranges
        .into_par_iter()
        .map(|range| build_group(&instances[range.clone()], policies, &degrees, attraction))
        .collect();

    let mut evidence = BuildEvidence {
        pruning_threshold: attraction.pruning_threshold,
        retained_edges: 0,
        pruned_edges: 0,
        retained_mass: 0.0,
        pruned_mass: 0.0,
        self_references,
    };
    let mut groups = Vec::with_capacity(built.len());
    for (group, partial) in built {
        evidence.retained_edges += group.edges.len();
        evidence.pruned_edges += partial.pruned;
        evidence.retained_mass += partial.retained_mass;
        evidence.pruned_mass += partial.pruned_mass;
        if !group.edges.is_empty() {
            groups.push(group);
        }
    }

    let pairs = aggregate_protection(&instances, policies, protection);

    Ok(RelationIndexes {
        attraction: AttractionIndex { groups },
        protection: ProtectionIndex { pairs },
        evidence,
    })
}

/// Checks the policy table's order and every policy's value domains.
fn validate_policies(policies: &[RelationPolicy]) -> Result<(), RelationIndexError> {
    let mut previous = None;
    for (position, policy) in policies.iter().enumerate() {
        let relation = policy.relation.get();
        if previous.is_some_and(|previous| previous >= relation) {
            return Err(RelationIndexError::PolicyOrder {
                position,
                relation: policy.relation,
            });
        }
        previous = Some(relation);

        let unit = 0.0..=1.0;
        let probabilities = [
            policy.attraction.coincident,
            policy.attraction.proximal,
            policy.selected.coincident,
            policy.selected.proximal,
            policy.applicability,
        ];
        if probabilities.iter().any(|value| !unit.contains(value))
            || !policy.strength.is_finite()
            || policy.strength < 0.0
        {
            return Err(RelationIndexError::PolicyDomain {
                relation: policy.relation,
            });
        }
    }
    Ok(())
}

/// Checks one instance's policy reference, endpoints, and confidences.
fn validate_instance(
    instance: &RelationInstance,
    rows: usize,
    policies: &[RelationPolicy],
) -> Result<(), RelationIndexError> {
    if policy_of(policies, instance.relation).is_none() {
        return Err(RelationIndexError::MissingPolicy {
            edge: instance.edge,
            relation: instance.relation,
        });
    }

    for endpoint in [instance.source, instance.target] {
        if endpoint.get() >= rows as u64 {
            return Err(RelationIndexError::EndpointOutOfBounds {
                edge: instance.edge,
                endpoint,
                rows,
            });
        }
    }

    let scores = [
        instance.confidence.link,
        instance.confidence.source,
        instance.confidence.target,
    ];
    for value in scores.into_iter().flatten() {
        if !(0.0..=1.0).contains(&value) {
            return Err(RelationIndexError::ConfidenceDomain {
                edge: instance.edge,
                value,
            });
        }
    }
    Ok(())
}

/// Rejects instance sets where one `(edge, relation)` occurs twice.
fn reject_duplicates(instances: &[RelationInstance]) -> Result<(), RelationIndexError> {
    let mut keys: Vec<(u64, u64)> = instances
        .iter()
        .map(|instance| (instance.relation.get(), instance.edge.get()))
        .collect();
    keys.par_sort_unstable();
    for window in keys.windows(2) {
        if window[0] == window[1] {
            let (relation, edge) = window[0];
            return Err(RelationIndexError::DuplicateInstance {
                edge: EdgeRowId::new(edge),
                relation: OntologyRowId::new(relation),
            });
        }
    }
    Ok(())
}

/// Looks up a relation's policy in the ascending policy table.
fn policy_of(policies: &[RelationPolicy], relation: OntologyRowId) -> Option<&RelationPolicy> {
    policies
        .binary_search_by_key(&relation.get(), |policy| policy.relation.get())
        .ok()
        .map(|position| &policies[position])
}

/// Admitted-instance counts per `(relation, node)`, ascending by key.
struct Degrees(Vec<(u64, u64, u64)>);

impl Degrees {
    /// Counts every endpoint mention over the complete instance set.
    fn count(instances: &[RelationInstance]) -> Self {
        let mut mentions: Vec<(u64, u64)> = instances
            .iter()
            .flat_map(|instance| {
                [
                    (instance.relation.get(), instance.source.get()),
                    (instance.relation.get(), instance.target.get()),
                ]
            })
            .collect();
        mentions.par_sort_unstable();

        Self(
            mentions
                .chunk_by(|one, other| one == other)
                .map(|run| (run[0].0, run[0].1, run.len() as u64))
                .collect(),
        )
    }

    /// Returns a counted endpoint's degree.
    ///
    /// # Panics
    ///
    /// Panics when the `(relation, node)` key was never counted; every
    /// instance endpoint is, by construction.
    fn get(&self, relation: OntologyRowId, node: NodeRowId) -> u64 {
        let position = self
            .0
            .binary_search_by_key(&(relation.get(), node.get()), |&(relation, node, _)| {
                (relation, node)
            })
            .expect("every instance endpoint was counted");
        self.0[position].2
    }
}

/// Per-group pruning tallies beside the group they describe.
struct GroupEvidence {
    pruned: usize,
    retained_mass: f64,
    pruned_mass: f64,
}

/// Builds one relation's attraction group from its contiguous instances.
fn build_group(
    instances: &[RelationInstance],
    policies: &[RelationPolicy],
    degrees: &Degrees,
    attraction: AttractionOptions,
) -> (AttractionGroup, GroupEvidence) {
    let relation = instances[0].relation;
    let policy = policy_of(policies, relation).expect("every instance's policy was validated");
    let weights = AttractionWeights {
        coincident: attraction.coincident_coefficient * policy.attraction.coincident,
        proximal: policy.attraction.proximal,
        strength: policy.strength,
    };
    let scale = weights.scale();

    let mut edges = Vec::with_capacity(instances.len());
    let mut evidence = GroupEvidence {
        pruned: 0,
        retained_mass: 0.0,
        pruned_mass: 0.0,
    };
    for instance in instances {
        let confidence = instance.confidence.effective();
        let mass = confidence.value() * scale;
        if mass < attraction.pruning_threshold {
            evidence.pruned += 1;
            evidence.pruned_mass += f64::from(mass);
            continue;
        }

        #[expect(
            clippy::cast_precision_loss,
            clippy::cast_possible_truncation,
            reason = "degrees are bounded by the instance count, far below f64 integer precision; \
                      the final narrowing to working precision is the operation"
        )]
        let degree_normalization = {
            let source = degrees.get(relation, instance.source);
            let target = degrees.get(relation, instance.target);
            (((1 + source) as f64 * (1 + target) as f64).sqrt().recip()) as f32
        };

        edges.push(AttractionEdge {
            edge: instance.edge,
            source: instance.source,
            target: instance.target,
            confidence,
            degree_normalization,
        });
        evidence.retained_mass += f64::from(mass);
    }

    (
        AttractionGroup {
            relation,
            weights,
            edges,
        },
        evidence,
    )
}

/// Aggregates per-pair protection masses over the complete instance set.
fn aggregate_protection(
    instances: &[RelationInstance],
    policies: &[RelationPolicy],
    protection: ProtectionOptions,
) -> Vec<PairProtection> {
    let mut masses: Vec<(NodePair, f32, f32)> = instances
        .par_iter()
        .map(|instance| {
            let policy = policy_of(policies, instance.relation)
                .expect("every instance's policy was validated");
            let confidence = instance.confidence.effective().value();
            let positive = policy.selected.coincident + policy.selected.proximal;
            let hard = confidence * policy.applicability.max(protection.hard_floor) * positive;
            let ordinary =
                confidence * policy.applicability.max(protection.ordinary_floor) * positive;
            (
                NodePair::new(instance.source, instance.target),
                hard,
                ordinary,
            )
        })
        .collect();
    // Ties under the pair-only key are aggregated by maximum, which is
    // order-independent over the finite masses, so the sort's tie order
    // does not reach the result.
    masses.par_sort_unstable_by_key(|&(pair, ..)| pair.key());

    masses
        .chunk_by(|&(one, ..), &(other, ..)| one.key() == other.key())
        .map(|run| PairProtection {
            pair: run[0].0,
            hard_mass: run.iter().map(|&(_, hard, _)| hard).fold(0.0, f32::max),
            ordinary_mass: run
                .iter()
                .map(|&(_, _, ordinary)| ordinary)
                .fold(0.0, f32::max),
        })
        .collect()
}
