//! Synthetic relation corpora for measuring volume concentration and hubbed endpoints.

use core::num::NonZero;
use std::sync::OnceLock;

use hashql_core::id::Id;
use rand::{Rng, RngExt as _, SeedableRng};

use super::super::{
    Policies, RelationConfidence, RelationInstance, RelationPolicy,
    attraction::AttractionOptions,
    build::{self, ProtectionRecord},
    protection::ProtectionIndex,
};
use crate::{
    identity::OntologyRowId,
    math::{NonNegative, UnitFraction},
    random::uniform_below,
    salt::policy::ClassProbabilities,
};

/// Cumulative specific-type link volumes measured in the live store.
///
/// The recorded histogram covers 2,196,563 links across sixteen specific types. The largest has
/// 739,374 links (about 34%), the smallest four. Uniform positions below the total select types
/// with probabilities proportional to these volumes. Finite synthesized counts fluctuate rather
/// than reproducing exact proportions.
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
/// An odd integer is invertible modulo any power of two. Multiplication by this constant followed
/// by the row mask permutes that domain. Therefore distinct in-domain ranks map to distinct rows.
const HUB_SCATTER: u64 = 0x9E37_79B9_7F4A_7C15;

/// How a synthesized corpus distributes volume over relation types.
///
/// Profiles share an endpoint-generation law, instance count and policy table. Live type draws
/// consume additional randomness, changing the realized endpoints even at the same seed. Relation
/// assignments also change policy-weight mixtures and degrees. Timing differences do not isolate
/// relation skew alone.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Profile {
    /// A shared base type plus a specific type drawn from the recorded histogram.
    ///
    /// Exactly half of all instances have the base relation. Both readings use multiplicity one.
    Live,
    /// Round-robin readings whose type counts differ by at most one.
    ///
    /// Each synthetic link has two distinct relation readings, both at multiplicity one.
    Uniform,
    /// One relation owns every instance, as pairs of distinct single-reading edges.
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
/// Synthesis retains the instance buffer. Group-sorted instances, emission-order protection records
/// and the assembled protection index initialize lazily and remain cached. Full builds additionally
/// require a mutable instance copy. Stage isolation can retain all of these buffers at once.
///
/// `N` must represent the full row domain and its end fencepost, and `E` must represent the
/// generated edge ids. Stage assembly requires the row count to fit `u32`, a bound synthesis does
/// not check.
pub struct Corpus<N, E> {
    rows: usize,
    links: usize,
    policies: Vec<RelationPolicy>,
    instances: Vec<RelationInstance<N, E>>,
    grouped: OnceLock<Vec<RelationInstance<N, E>>>,
    records: OnceLock<Vec<ProtectionRecord<N>>>,
    protection: OnceLock<ProtectionIndex<N>>,
}

impl<N, E> Corpus<N, E> {
    /// Synthesizes a corpus of `links` links under `profile`.
    ///
    /// The row count is the largest power of two not exceeding `max(links / 2, 64)`. This
    /// approximates the recorded 2.2M-link, 1M-row scale. Sources are uniform over rows. The
    /// recorded hub profile has about 124K distinct targets, motivating `H = rows / 8`. Its largest
    /// target holds 9% of links.
    ///
    /// For a uniform `U ∈ [0, 1)`, target rank is `floor(Hᵁ) − 1`, scattered through an odd modular
    /// multiplier. In ideal arithmetic, rank `k` has probability `ln((k + 2)/(k + 1)) / ln(H)` for
    /// `0 ≤ k ≤ H − 2`. This is a Zipf-like hub distribution and no exact replay of the measured
    /// target counts. Floating-point power evaluation and discrete random draws approximate this
    /// law.
    ///
    /// Each input link produces two instances with unscored confidence. Live and Uniform repeat the
    /// edge id under distinct relations but leave multiplicity at one. They measure full-share
    /// emission, not the production two-reading share of one half. Mega instead assigns distinct
    /// edge ids under one relation. Self-references remain in synthesis output for the build to
    /// drop.
    ///
    /// Equal arguments repeat at the same RNG and floating-point implementation. Power evaluation
    /// does not promise cross-target bit identity. The `links` parameter counts endpoint draws, not
    /// distinct edge ids in every profile.
    ///
    /// # Panics
    ///
    /// Panics when generated ids exceed `N` or `E`'s range, or the instance allocation exceeds
    /// capacity. `2 · links` must fit `usize`.
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
        N: Id,
        E: Id,
    {
        let mut rng = R::seed_from_u64(seed);
        let rows = 1_usize << (links / 2).max(64).ilog2();
        let row_bound = NonZero::new(rows as u64).expect("the row domain is at least 64");
        let hubs = (rows / 8).max(1);

        let endpoints = |rng: &mut R| {
            let source = N::from_u64(uniform_below(&mut *rng, row_bound));

            #[expect(
                clippy::cast_precision_loss,
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "the power-of-two hub count converts exactly to f64. The power lies \
                          between one and that count, within the integer encodings"
            )]
            let rank = (hubs as f64).powf(rng.random::<f64>()) as u64 - 1;
            let target = N::from_u64(rank.wrapping_mul(HUB_SCATTER) & (rows as u64 - 1));
            (source, target)
        };

        let instance = |edge: u64, relation: usize, (source, target): (N, N)| RelationInstance {
            edge: E::from_u64(edge),
            relation: OntologyRowId::from_usize(relation),
            source,
            target,
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        };

        let mut instances = Vec::with_capacity(links * 2);
        for link in 0..links {
            let edge = link as u64;
            match profile {
                Profile::Live => {
                    // a base reading and a histogram-drawn specific reading share the edge id.
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
                    // consecutive positions modulo seventeen give distinct relations within each
                    // pair. Across all readings, type counts differ by at most one.
                    let at = endpoints(&mut rng);
                    instances.push(instance(edge, (link * 2) % RELATION_TYPES, at));
                    instances.push(instance(edge, (link * 2 + 1) % RELATION_TYPES, at));
                }
                Profile::Mega => {
                    // distinct edge ids keep each (edge, relation) reading unique while one
                    // relation holds both instances.
                    let at = endpoints(&mut rng);
                    instances.push(instance(edge * 2, 0, at));
                    instances.push(instance(edge * 2 + 1, 0, at));
                }
            }
        }

        let policies = (0..RELATION_TYPES)
            .map(|relation| {
                // varying mass and applicability let threshold and floor sweeps separate relations.
                let step = f64::from(u8::try_from(relation).expect("the table holds 17 types"));
                let distribution = ClassProbabilities {
                    coincident: UnitFraction::ZERO,
                    proximal: UnitFraction::new((step / 16.0).mul_add(-0.9375, 1.0))
                        .expect("the sweep interpolates inside the unit interval"),
                };
                RelationPolicy {
                    relation: OntologyRowId::from_usize(relation),
                    attraction: distribution,
                    selected: distribution,
                    applicability: UnitFraction::new((step / 16.0).mul_add(-0.75, 1.0))
                        .expect("the sweep interpolates inside the unit interval"),
                    strength: NonNegative::ONE,
                    _pad: [0; 4],
                }
            })
            .collect();

        Self {
            rows,
            links,
            policies,
            instances,
            grouped: OnceLock::new(),
            records: OnceLock::new(),
            protection: OnceLock::new(),
        }
    }

    /// Returns the node-row domain the corpus spans.
    #[inline]
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }

    /// Returns the requested number of endpoint draws.
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
    pub(super) const fn instances(&self) -> &[RelationInstance<N, E>] {
        self.instances.as_slice()
    }

    /// Borrows the group-sorted proper instances, sorting on first use.
    pub(super) fn grouped(&self) -> &[RelationInstance<N, E>]
    where
        N: Id,
        E: Id,
    {
        self.grouped.get_or_init(|| {
            let mut grouped = self.instances.clone();
            let proper = build::sort_by_group(&mut grouped);
            grouped.truncate(proper);
            grouped
        })
    }

    /// Borrows the emitted protection records in emission order, emitting on first use.
    ///
    /// # Panics
    ///
    /// Panics when `N` cannot represent zero for scratch initialization.
    pub(super) fn records(&self) -> &[ProtectionRecord<N>]
    where
        N: Id,
        E: Id,
    {
        self.records.get_or_init(|| {
            let grouped = self.grouped();
            let ranges = build::resolve_groups(grouped, self.policies())
                .expect("the synthesized corpus covers every relation");

            let mut records = vec![ProtectionRecord::empty(); grouped.len()];
            drop(build::build_groups(
                grouped,
                ranges,
                &mut records,
                AttractionOptions::default(),
                build::EMISSION_CHUNK,
            ));
            records
        })
    }

    /// Returns the certified policy table.
    pub(super) fn policies(&self) -> Policies<'_> {
        Policies::new(&self.policies).expect("the synthesized table is ascending and in domain")
    }

    /// Borrows the assembled protection index, assembling on first use.
    ///
    /// # Panics
    ///
    /// Panics when the row domain exceeds the matrix encoding or required row positions cannot be
    /// represented by `N`.
    pub(super) fn protection(&self) -> &ProtectionIndex<N>
    where
        N: Id,
        E: Id,
    {
        self.protection.get_or_init(|| {
            let mut records = self.records().to_vec();
            build::assemble_protection(self.rows, &mut records)
        })
    }
}
