//! Judge-layout runners for pointwise probes and row-batched merges.
//!
//! Pointwise judgment uses one row resolution and binary search per pair. Row-merge judgment walks
//! each query row's partners against its sorted candidates. These runners compare both access
//! patterns over identical probe sets. The pointwise path uses the production lookup, while the
//! row-merge path implements the alternative for measurement.
//!
//! Both use the default protection configuration, whose zero thresholds protect every stored pair.
//! The comparison does not evaluate non-default threshold calibration.

use core::num::NonZero;

use hashql_core::id::Id;
use rand::{Rng, RngExt as _, SeedableRng};

use super::Corpus;
use crate::{
    random::uniform_below,
    salt::relation::protection::{NodePair, ProtectionConfig},
};

/// A full mining sweep's candidate pairs, one chunk per node row.
///
/// Row `i`'s candidates occupy the `i`-th fixed-width chunk in ascending order, as the row-merge
/// runner requires. Draws have replacement and may include duplicates and self-candidates. This
/// type carries no corpus identity.
pub struct JudgeProbes<N> {
    per_row: NonZero<usize>,
    candidates: Vec<N>,
}

impl<N> JudgeProbes<N> {
    /// Returns the probe-pair count over all rows.
    #[inline]
    #[must_use]
    pub const fn pairs(&self) -> usize {
        self.candidates.len()
    }
}

impl<N, E> Corpus<N, E> {
    /// Synthesizes one mining sweep's worth of judge probes.
    ///
    /// Every node row queries `per_row` candidates. Each candidate is one of the row's linked
    /// partners with probability `partner_fraction` (falling back to a uniform row when the row has
    /// no partners) and a uniform row otherwise. Draws have replacement.
    ///
    /// For a row with `d > 0` partners among `N` rows and fraction `f ∈ [0, 1]`, the ideal
    /// protected-hit probability is:
    ///
    /// `f + (1 − f) · d/N`, since a uniform draw can also hit a partner.
    ///
    /// Rows with no partners have zero hits. Sweep the fraction to compare hit-poor and hit-rich
    /// access, without assuming a real miner's hit rate.
    ///
    /// The fraction is not validated. Values at or below zero and NaN select only uniform draws.
    /// Values at or above one always select a partner when one exists.
    ///
    /// # Panics
    ///
    /// Panics when the cached protection index cannot be assembled, row ids cannot be represented,
    /// or the probe allocation exceeds capacity. `rows · per_row` must fit `usize`.
    #[must_use]
    pub fn judge_probes<R>(
        &self,
        per_row: NonZero<usize>,
        partner_fraction: f64,
        seed: u64,
    ) -> JudgeProbes<N>
    where
        R: Rng + SeedableRng,
        N: Id,
        E: Id,
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
                    .row(N::from_usize(row))
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
                    N::from_u64(uniform_below(&mut rng, row_bound))
                };

                candidates.push(candidate);
            }

            candidates[chunk..].sort_unstable();
        }

        JudgeProbes {
            per_row,
            candidates,
        }
    }

    /// Judges every probe pair through pointwise probes.
    ///
    /// Returns the hard-protected count, including repeated candidates. Use probes from this corpus
    /// to compare with [`Self::judge_by_row`]. Probes carry no checked corpus association.
    ///
    /// # Complexity
    ///
    /// After cached index assembly, `P` probes take `O(P log(d + 2))` time for maximum stored row
    /// length `d`.
    ///
    /// # Panics
    ///
    /// Panics if cached protection assembly fails or a probe row position cannot be represented by
    /// `N`.
    #[must_use]
    pub fn judge_pointwise(&self, probes: &JudgeProbes<N>) -> usize
    where
        N: Id,
        E: Id,
    {
        let protection = self.protection().view();
        let config = ProtectionConfig::default();

        let mut protected = 0;
        for (row, chunk) in probes
            .candidates
            .chunks_exact(probes.per_row.get())
            .enumerate()
        {
            let row = N::from_usize(row);

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
    /// Returns the hard-protected count, including repeated candidates. With probes from this
    /// corpus, the count equals [`Self::judge_pointwise`]'s. Candidate duplicates leave the
    /// matching partner available for each repeated count.
    ///
    /// # Complexity
    ///
    /// After cached index assembly, takes `O(N + P + M)` time for `N` queried rows, `P` probes and
    /// `M` stored entries in those rows. Each row's partners are traversed at most once.
    ///
    /// # Panics
    ///
    /// Panics if cached protection assembly fails, `N` cannot represent a required row, or the
    /// probes contain more row chunks than this corpus has rows.
    #[must_use]
    pub fn judge_by_row(&self, probes: &JudgeProbes<N>) -> usize
    where
        N: Id,
        E: Id,
    {
        let protection = self.protection().view();
        let config = ProtectionConfig::default();

        let mut protected = 0;
        for (row, chunk) in probes
            .candidates
            .chunks_exact(probes.per_row.get())
            .enumerate()
        {
            let mut partners = protection.row(N::from_usize(row)).peekable();

            for &candidate in chunk {
                while partners
                    .next_if(|entry| entry.partner.as_u64() < candidate.as_u64())
                    .is_some()
                {}

                if let Some(entry) = partners.peek()
                    && entry.partner.as_u64() == candidate.as_u64()
                    && config.hard().protects(entry.evidence)
                {
                    protected += 1;
                }
            }
        }

        protected
    }
}
