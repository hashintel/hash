//! Judge-layout runners: pointwise probes against row-batched merges.
//!
//! Hard-negative mining vets every mined candidate pair against the
//! protection index, and it can ask in two shapes: one `judge` probe
//! per pair - a row resolution plus a binary search - or one `row`
//! walk per query point, merged against that point's sorted candidate
//! list. The runners here execute both shapes over identical probe
//! sets so the miner's access layout is decided by numbers. The
//! pointwise runner calls the production probe; the row-merge runner
//! is the candidate layout under audition, written here once so a
//! decision for it promotes this merge into the protection view.
//!
//! Probes are judged under the default protection configuration, whose
//! zero thresholds protect exactly the linked pairs - the conservative
//! baseline every calibration starts from.

use core::num::NonZero;

use rand::{Rng, RngExt as _, SeedableRng};

use super::Corpus;
use crate::{
    dataset::NodeRowId,
    random::uniform_below,
    salt::relation::protection::{NodePair, ProtectionConfig},
};

/// A full mining sweep's candidate pairs, one chunk per node row.
///
/// Row `i`'s candidates occupy the `i`-th fixed-width chunk, ascending
/// within the chunk: the shape a mined neighbour list takes after
/// canonical ordering, and the order the row-merge runner requires.
pub struct JudgeProbes {
    per_row: NonZero<usize>,
    candidates: Vec<NodeRowId>,
}

impl JudgeProbes {
    /// Returns the probe-pair count over all rows.
    #[inline]
    #[must_use]
    pub const fn pairs(&self) -> usize {
        self.candidates.len()
    }
}

impl Corpus {
    /// Synthesizes one mining sweep's worth of judge probes.
    ///
    /// Every node row queries `per_row` candidates. Each candidate is
    /// one of the row's linked partners with probability
    /// `partner_fraction` (falling back to a uniform row when the row
    /// has no partners) and a uniform row otherwise. The fraction
    /// dials the sweep's protected-hit rate: attraction pulls linked
    /// pairs together in 2D, so a real mining sweep is hit-rich, and
    /// the layout question needs a hit-poor reading beside it.
    ///
    /// # Panics
    ///
    /// Panics when the probe set does not fit the address space; every
    /// internal expectation is satisfied by construction.
    #[must_use]
    pub fn judge_probes<R>(
        &self,
        per_row: NonZero<usize>,
        partner_fraction: f64,
        seed: u64,
    ) -> JudgeProbes
    where
        R: Rng + SeedableRng,
    {
        let mut rng = R::seed_from_u64(seed);
        let protection = self.protection().view();
        let row_bound = NonZero::new(self.rows() as u64).expect("the row domain is at least 64");

        let mut candidates = Vec::with_capacity(self.rows() * per_row.get());
        let mut partners = Vec::new();
        for row in 0..self.rows() {
            partners.clear();
            partners.extend(
                protection
                    .row(NodeRowId::new(row as u64))
                    .map(|entry| entry.partner),
            );
            let chunk = candidates.len();
            for _ in 0..per_row.get() {
                let of_partner = !partners.is_empty() && rng.random::<f64>() < partner_fraction;
                let candidate = if of_partner {
                    let bound =
                        NonZero::new(partners.len() as u64).expect("the partner list is non-empty");
                    let position = usize::try_from(uniform_below(&mut rng, bound))
                        .expect("a resident row's partner count fits the address space");
                    partners[position]
                } else {
                    NodeRowId::new(uniform_below(&mut rng, row_bound))
                };
                candidates.push(candidate);
            }
            candidates[chunk..].sort_unstable_by_key(|candidate| candidate.get());
        }

        JudgeProbes {
            per_row,
            candidates,
        }
    }

    /// Judges every probe pair through pointwise probes.
    ///
    /// One production `judge` call per pair. Returns the
    /// hard-protected count, which doubles as the cross-layout
    /// agreement check.
    #[must_use]
    pub fn judge_pointwise(&self, probes: &JudgeProbes) -> usize {
        let protection = self.protection().view();
        let config = ProtectionConfig::default();

        let mut protected = 0;
        for (row, chunk) in probes
            .candidates
            .chunks_exact(probes.per_row.get())
            .enumerate()
        {
            let row = NodeRowId::new(row as u64);
            for &candidate in chunk {
                if protection.judge(NodePair::new(row, candidate), config).hard {
                    protected += 1;
                }
            }
        }
        protected
    }

    /// Judges every probe pair through one row merge per query row.
    ///
    /// Walks each row's protected partners once, merged against the
    /// row's ascending candidate chunk. Returns the hard-protected
    /// count; equal probes yield the pointwise runner's count exactly.
    #[must_use]
    pub fn judge_by_row(&self, probes: &JudgeProbes) -> usize {
        let protection = self.protection().view();
        let config = ProtectionConfig::default();

        let mut protected = 0;
        for (row, chunk) in probes
            .candidates
            .chunks_exact(probes.per_row.get())
            .enumerate()
        {
            let mut partners = protection.row(NodeRowId::new(row as u64)).peekable();
            for &candidate in chunk {
                while partners
                    .next_if(|entry| entry.partner.get() < candidate.get())
                    .is_some()
                {}
                if let Some(entry) = partners.peek()
                    && entry.partner.get() == candidate.get()
                    && config.hard().protects(entry.evidence)
                {
                    protected += 1;
                }
            }
        }
        protected
    }
}
