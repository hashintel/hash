//! Synthetic relation corpora at the live store's measured shape.

use core::num::NonZero;
use std::sync::OnceLock;

use rand::{Rng, RngExt as _, SeedableRng};

use super::super::{
    Policies, RelationConfidence, RelationInstance, RelationPolicy, build,
    protection::ProtectionIndex,
};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId},
    random::uniform_below,
    salt::policy::ClassProbabilities,
};

/// Cumulative specific-type link volumes measured in the live store.
///
/// Sixteen specific relation types over 2,196,563 links, spanning five orders of magnitude; the
/// largest owns 34% of links, the smallest 4 links. Sampling a uniform position below the total and
/// bucketing by these boundaries reproduces the measured volume distribution at any corpus scale.
const MEASURED_SPECIFIC_CUMULATIVE: [u64; 16] = [
    739_374, 1_405_028, 1_861_990, 1_971_015, 2_041_671, 2_096_752, 2_143_950, 2_165_211,
    2_185_797, 2_190_391, 2_193_025, 2_195_240, 2_196_479, 2_196_553, 2_196_559, 2_196_563,
];

/// The measured link total behind the cumulative volumes.
const MEASURED_LINKS: NonZero<u64> =
    NonZero::new(MEASURED_SPECIFIC_CUMULATIVE[15]).expect("the measured corpus is non-empty");

/// Relation types in the synthesized table: one base plus the sixteen specific types.
const RELATION_TYPES: usize = 1 + MEASURED_SPECIFIC_CUMULATIVE.len();

/// Odd multiplier scattering hub ranks over the power-of-two row domain.
///
/// Odd times anything is invertible modulo a power of two, so distinct ranks land on distinct rows.
const HUB_SCATTER: u64 = 0x9E37_79B9_7F4A_7C15;

/// How a synthesized corpus distributes volume over relation types.
///
/// All three profiles share the same endpoint generator, instance volume, and policy table; they
/// differ only in volume concentration, so a timing difference between them is attributable to skew
/// alone.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Profile {
    /// The measured live shape.
    ///
    /// Every link carries the shared base type plus one specific type drawn from the measured
    /// histogram, so the base relation owns exactly half of all instances.
    Live,
    /// The same instance volume spread evenly over the same type count.
    Uniform,
    /// One relation owns every instance.
    Mega,
}

impl Profile {
    /// Returns the profile's benchmark label.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Live => "live",
            Self::Uniform => "uniform",
            Self::Mega => "mega",
        }
    }
}

/// A synthesized relation corpus with sorted stage inputs on demand.
///
/// Holds the raw instance set; the group-sorted and pair-sorted copies each build stage starts from
/// materialize on first use and stay cached, so a corpus that only runs full builds keeps one copy
/// resident (roughly 250 MB at the live scale of 2.2M links) and one that isolates stages keeps
/// three.
pub struct Corpus {
    rows: usize,
    links: usize,
    policies: Vec<RelationPolicy>,
    instances: Vec<RelationInstance>,
    grouped: OnceLock<Vec<RelationInstance>>,
    paired: OnceLock<Vec<RelationInstance>>,
    protection: OnceLock<ProtectionIndex>,
}

impl Corpus {
    /// Synthesizes a corpus of `links` links under `profile`.
    ///
    /// The row domain is the largest power of two at most half the link count (the live ratio: 2.2M
    /// links over 1M rows), floored at 64. Sources are uniform over the rows; targets follow a
    /// truncated Zipf tail over one eighth of the rows (the measured hub shape: 124K distinct
    /// targets, the largest gathering 9% of all links). Confidence is unscored throughout, the live
    /// corpus's only shape. Every draw comes from `rng` seeded with `seed`, so equal arguments
    /// synthesize equal corpora.
    ///
    /// # Panics
    ///
    /// Panics when the instance set does not fit the address space; every internal expectation is
    /// satisfied by construction.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the row domain and hub count are deliberate integer scalings of the link count, \
                  and the round-robin modulus is the uniform profile's assignment rule"
    )]
    #[must_use]
    pub fn synthesize<R>(profile: Profile, links: usize, seed: u64) -> Self
    where
        R: Rng + SeedableRng,
    {
        let mut rng = R::seed_from_u64(seed);
        let rows = 1_usize << (links / 2).max(64).ilog2();
        let row_bound = NonZero::new(rows as u64).expect("the row domain is at least 64");
        let hubs = (rows / 8).max(1);

        let endpoints = |rng: &mut R| {
            let source = NodeRowId::new(uniform_below(&mut *rng, row_bound));
            #[expect(
                clippy::cast_precision_loss,
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "the hub count is far below f64 integer precision, and the Zipf power \
                          lies in [1, hubs), so the floor fits every integer type in play"
            )]
            let rank = (hubs as f64).powf(rng.random::<f64>()) as u64 - 1;
            let target = NodeRowId::new(rank.wrapping_mul(HUB_SCATTER) & (rows as u64 - 1));
            (source, target)
        };
        let instance = |edge: u64, relation: usize, (source, target): (NodeRowId, NodeRowId)| {
            RelationInstance {
                edge: EdgeRowId::new(edge),
                relation: OntologyRowId::from_index(relation),
                source,
                target,
                confidence: RelationConfidence::default(),
                multiplicity: 1,
            }
        };

        let mut instances = Vec::with_capacity(links * 2);
        for link in 0..links {
            let edge = link as u64;
            match profile {
                Profile::Live => {
                    // One link, two readings sharing the edge row: the
                    // base type and a histogram-drawn specific type.
                    let at = endpoints(&mut rng);
                    let position = uniform_below(&mut rng, MEASURED_LINKS);
                    let specific = 1 + MEASURED_SPECIFIC_CUMULATIVE
                        .iter()
                        .position(|&boundary| position < boundary)
                        .expect("the position lies below the final boundary");
                    instances.push(instance(edge, 0, at));
                    instances.push(instance(edge, specific, at));
                }
                Profile::Uniform => {
                    // Round-robin over an odd type count: the pair is
                    // always distinct and every type's volume is even.
                    let at = endpoints(&mut rng);
                    instances.push(instance(edge, (link * 2) % RELATION_TYPES, at));
                    instances.push(instance(edge, (link * 2 + 1) % RELATION_TYPES, at));
                }
                Profile::Mega => {
                    // Two parallel single-reading links between one
                    // endpoint pair: the same instance, pair, and
                    // protection-entry volume as the other profiles
                    // while one relation owns everything.
                    let at = endpoints(&mut rng);
                    instances.push(instance(edge * 2, 0, at));
                    instances.push(instance(edge * 2 + 1, 0, at));
                }
            }
        }

        let policies = (0..RELATION_TYPES)
            .map(|relation| {
                // Masses and applicabilities spread across the table so
                // pruning-threshold and floor sweeps separate relations
                // instead of dropping all or nothing.
                let step = f32::from(u8::try_from(relation).expect("the table holds 17 types"));
                let distribution = ClassProbabilities {
                    coincident: 0.0,
                    proximal: (step / 16.0).mul_add(-0.9375, 1.0),
                };
                RelationPolicy {
                    relation: OntologyRowId::from_index(relation),
                    attraction: distribution,
                    selected: distribution,
                    applicability: (step / 16.0).mul_add(-0.75, 1.0),
                    strength: 1.0,
                }
            })
            .collect();

        Self {
            rows,
            links,
            policies,
            instances,
            grouped: OnceLock::new(),
            paired: OnceLock::new(),
            protection: OnceLock::new(),
        }
    }

    /// Returns the node-row domain the corpus spans.
    #[inline]
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }

    /// Returns the synthesized link count.
    #[inline]
    #[must_use]
    pub const fn links(&self) -> usize {
        self.links
    }

    /// Returns the instance count, twice the link count.
    #[inline]
    #[must_use]
    pub const fn instance_count(&self) -> usize {
        self.instances.len()
    }

    /// Borrows the instances in synthesis order.
    pub(super) const fn instances(&self) -> &[RelationInstance] {
        self.instances.as_slice()
    }

    /// Borrows the group-sorted proper instances, sorting on first use.
    pub(super) fn grouped(&self) -> &[RelationInstance] {
        self.grouped.get_or_init(|| {
            let mut grouped = self.instances.clone();
            let proper = build::sort_by_group(&mut grouped);
            grouped.truncate(proper);
            grouped
        })
    }

    /// Borrows the pair-sorted proper instances, sorting on first use.
    pub(super) fn paired(&self) -> &[RelationInstance] {
        self.paired.get_or_init(|| {
            let mut paired = self.grouped().to_vec();
            build::sort_by_pair(&mut paired);
            paired
        })
    }

    /// Returns the certified policy table.
    pub(super) fn policies(&self) -> Policies<'_> {
        Policies::new(&self.policies).expect("the synthesized table is ascending and in domain")
    }

    /// Borrows the assembled protection index, assembling on first use.
    pub(super) fn protection(&self) -> &ProtectionIndex {
        self.protection
            .get_or_init(|| build::assemble_protection(self.rows, self.paired(), self.policies()))
    }
}
