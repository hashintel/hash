//! Synthetic corpora and stage runners for measuring relation-index construction.
//!
//! Use [`production_corpus`] to construct inputs with the production row types. [`Profile`] varies
//! relation concentration, with the fixture's statistical and multiplicity limitations documented
//! on [`Corpus::synthesize`]. The runners expose the production stages of
//! [`RelationIndexes::build`] to measure group-emission scaling, assembly cost and the effect of
//! the emission-chunk size.
//!
//! Clone [`Scratch`] and [`Records`] outside the timed region. A corpus lazily caches grouped
//! instances, emitted records and a protection index. Warm the relevant accessor or stage before
//! timing if those initializations should be excluded. Stage runners still include the allocations
//! performed by the stage itself.
//!
//! [`JudgeProbes`] supplies one candidate sweep to compare pointwise lookups with a row-merge
//! implementation. The comparison evaluates an alternative access pattern under the default
//! protection settings, not a complete mining algorithm.
//!
//! # Example
//!
//! With the `bench` feature enabled, a small corpus can exercise the build without timing it:
//!
//! ```rust
//! use hash_graph_atlas::bench::relation::{Profile, production_corpus};
//!
//! let corpus = production_corpus(Profile::Live, 128, 42);
//! assert_eq!(corpus.instance_count(), 256);
//! let mut scratch = corpus.scratch();
//! let proper = scratch.sort_by_group();
//! let summary = corpus.build_in(&mut scratch, 0.0, 0.0);
//! assert_eq!(summary.retained_edges, proper);
//! assert_eq!(summary.pruned_edges, 0);
//! ```

use hashql_core::id::Id;
use rand_xoshiro::Xoshiro256PlusPlus;

pub use self::{
    fixture::{Corpus, Profile},
    judge::JudgeProbes,
};
use super::{
    RelationIndexes,
    attraction::AttractionOptions,
    build::{self, EMISSION_CHUNK, ProtectionRecord},
};
use crate::{
    identity::{EdgeRowId, NodeRowId},
    math::NonNegative,
};

mod fixture;
mod judge;

#[cfg(test)]
mod tests;

/// Returns the production emission chunk size for comparison with nearby sizes.
#[must_use]
pub const fn production_chunk() -> usize {
    EMISSION_CHUNK
}

/// Synthesizes a corpus with the production node and edge row types.
///
/// Uses [`Xoshiro256PlusPlus`] with [`Corpus::synthesize`]'s fixture model and replay limits. See
/// the [module example](self).
///
/// # Panics
///
/// Panics when synthesis exceeds representable instance counts or allocation capacity.
#[must_use]
pub fn production_corpus(
    profile: Profile,
    links: usize,
    seed: u64,
) -> Corpus<NodeRowId, EdgeRowId> {
    Corpus::synthesize::<Xoshiro256PlusPlus>(profile, links, seed)
}

/// Plain-number summary of one full build.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BuildSummary {
    /// Attraction edges retained by the pruning predicate.
    pub retained_edges: usize,
    /// Attraction edges dropped by the pruning predicate.
    pub pruned_edges: usize,
    /// The fraction of `c · s · s+` mass dropped by pruning.
    pub omitted_mass_fraction: f64,
    /// Stored protection entries.
    ///
    /// Each linked pair counts twice.
    pub protection_entries: usize,
}

/// An owned instance buffer for stages that reorder their input.
///
/// Cloning copies the full instance buffer. Do it in the benchmark harness's setup phase, outside
/// the timed region.
#[derive(Clone)]
pub struct Scratch<N, E>(Vec<super::RelationInstance<N, E>>);

impl<N, E> Scratch<N, E> {
    /// Runs the group sort alone, returning the proper instance count.
    ///
    /// The buffer should hold instances in synthesis order ([`Corpus::scratch`]): the sort has a
    /// sortedness fast path. Reusing the sorted result would measure a different input state.
    pub fn sort_by_group(&mut self) -> usize
    where
        N: Id,
        E: Id,
    {
        build::sort_by_group(&mut self.0)
    }
}

/// An owned protection-record buffer for the assembly stage, in emission order.
///
/// Assembly reorders the records. Clone a fresh buffer outside the timed region for each run.
#[derive(Clone)]
pub struct Records<N>(Vec<ProtectionRecord<N>>);

impl<N, E> Corpus<N, E>
where
    N: Id,
    E: Id,
{
    /// Clones the instances in synthesis order, the full build's and the group sort's input state.
    #[must_use]
    pub fn scratch(&self) -> Scratch<N, E> {
        Scratch(self.instances().to_vec())
    }

    /// Clones the emitted protection records in emission order, the assembly's input state.
    ///
    /// The first call initializes the grouped-instance and emitted-record caches.
    ///
    /// # Panics
    ///
    /// Panics when `N` cannot represent zero.
    #[must_use]
    pub fn records_scratch(&self) -> Records<N> {
        Records(self.records().to_vec())
    }

    /// Runs the full production build over `scratch`.
    ///
    /// `scratch` must come from this corpus. Supplying another corpus's instances does not validate
    /// their provenance.
    ///
    /// # Panics
    ///
    /// Panics for non-finite or negative settings, a row domain exceeding `u32`, uncovered
    /// relations, or endpoints outside this corpus's row domain. `N` must represent every row,
    /// including zero.
    #[must_use]
    pub fn build_in(
        &self,
        scratch: &mut Scratch<N, E>,
        coincident: f32,
        pruning: f32,
    ) -> BuildSummary {
        // the external benchmark target supplies plain settings because the scalar types are
        // crate-private.
        let attraction = AttractionOptions::new(
            NonNegative::new(coincident).expect("the sweep passes a finite non-negative setting"),
            NonNegative::new(pruning).expect("the sweep passes a finite non-negative setting"),
        );
        let indexes =
            RelationIndexes::build(self.rows(), self.policies(), &mut scratch.0, attraction)
                .expect("the synthesized corpus satisfies the build contract");

        BuildSummary {
            retained_edges: indexes.measurements.retained_edges,
            pruned_edges: indexes.measurements.pruned_edges,
            omitted_mass_fraction: indexes.measurements.omitted_mass_fraction().get(),
            protection_entries: indexes.protection.matrix().nnz(),
        }
    }

    /// Runs the group emission alone with `chunk` as the emission chunk size.
    ///
    /// Includes group-range resolution and allocation of the protection records. The first call
    /// also initializes the cached group-sorted instances.
    ///
    /// # Panics
    ///
    /// Panics when `N` cannot represent zero, or when `chunk` is zero and the corpus has a non-self
    /// group.
    pub fn emit_groups(&self, chunk: usize) {
        let ranges = build::resolve_groups(self.grouped(), self.policies())
            .expect("the synthesized corpus covers every relation");
        let mut records = vec![ProtectionRecord::empty(); self.grouped().len()];
        drop(build::build_groups(
            self.grouped(),
            ranges,
            &mut records,
            AttractionOptions::default(),
            chunk,
        ));
    }

    /// Runs the protection assembly alone.
    ///
    /// Includes record sorting, aggregation, scatter and index validation. `records` must come from
    /// this corpus.
    ///
    /// # Panics
    ///
    /// Panics when record endpoints are outside this corpus's row domain, required row positions
    /// are unrepresentable, or the assembled matrix fails validation.
    pub fn assemble_protection(&self, records: &mut Records<N>) {
        drop(build::assemble_protection(self.rows(), &mut records.0));
    }

    /// Runs the protection index's validation alone, over the corpus's assembled index.
    ///
    /// The first call also assembles and caches the index. Warm it before timing validation
    /// separately. Comparing with [`Self::assemble_protection`] estimates the validation share of
    /// that stage, with cache and measurement effects.
    ///
    /// # Panics
    ///
    /// Panics if the initial assembly fails for an unrepresentable domain or the matrix violates an
    /// index invariant.
    pub fn validate_protection(&self) {
        let matrix = self.protection().matrix();
        super::protection::validate(matrix).expect("the assembled matrix is valid");
    }
}
