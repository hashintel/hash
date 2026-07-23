//! Benchmark seams over the relation-index build.
//!
//! Wall-time claims about the build - the mega relation no longer serializes emission, assembly is
//! sort-dominated, the emission chunk is a granularity rather than a tuned number - are claims
//! about parallel composition, and only hold or fail at realistic scale and skew. This module gives
//! the bench target (an external crate) exactly the levers those claims need while every internal
//! type stays private: corpus synthesis at measured live shapes ([`Corpus`], [`Profile`]), each
//! production stage runnable from its own input state, and plain-number summaries
//! ([`BuildSummary`]).
//!
//! The stage runners call the production functions that [`RelationIndexes::build`] composes, never
//! mirrors of them, so a change to the build is measured rather than silently diverged from. Stages
//! that reorder their input take a [`Scratch`] buffer the caller clones outside the timed region;
//! stages that only read consume the corpus's pre-sorted copies directly.
//!
//! Beside the build seams, the judge runners (`judge`) compare the two access layouts hard-negative
//! mining could vet candidates through: pointwise pair probes against per-row partner merges, over
//! one synthesized mining sweep ([`JudgeProbes`]).

pub use self::{
    fixture::{Corpus, Profile},
    judge::JudgeProbes,
};
use super::{
    RelationIndexes,
    attraction::AttractionOptions,
    build::{self, EMISSION_CHUNK, ProtectionRecord},
};

mod fixture;
mod judge;

#[cfg(test)]
mod tests;

/// The production emission granularity, for sweeping around it.
#[must_use]
pub const fn production_chunk() -> usize {
    EMISSION_CHUNK
}

/// Plain-number summary of one full build.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BuildSummary {
    /// Attraction edges retained by the pruning predicate.
    pub retained_edges: usize,
    /// Attraction edges dropped by the pruning predicate.
    pub pruned_edges: usize,
    /// The fraction of total force mass the pruning dropped.
    pub omitted_mass_fraction: f64,
    /// Stored protection entries; each linked pair counts twice.
    pub protection_entries: usize,
}

/// An owned instance buffer for stages that reorder their input.
///
/// Cloning one costs a large memcpy at bench scales; do it in the benchmark harness's setup phase,
/// outside the timed region.
#[derive(Clone)]
pub struct Scratch(Vec<super::RelationInstance>);

impl Scratch {
    /// Runs the group sort alone, returning the proper instance count.
    ///
    /// The buffer should hold instances in synthesis order ([`Corpus::scratch`]): the sort has a
    /// sortedness fast path, so only an unsorted buffer measures the production pass.
    pub fn sort_by_group(&mut self) -> usize {
        build::sort_by_group(&mut self.0)
    }
}

/// An owned protection-record buffer for the assembly stage, in emission order.
///
/// The assembly reorders its input, so each timed run takes a fresh clone; clone in the benchmark
/// harness's setup phase, outside the timed region.
#[derive(Clone)]
pub struct Records(Vec<ProtectionRecord>);

impl Corpus {
    /// Clones the instances in synthesis order, the full build's and the group sort's input state.
    #[must_use]
    pub fn scratch(&self) -> Scratch {
        Scratch(self.instances().to_vec())
    }

    /// Clones the emitted protection records in emission order, the assembly's input state.
    #[must_use]
    pub fn records_scratch(&self) -> Records {
        Records(self.records().to_vec())
    }

    /// Runs the full production build over `scratch`.
    ///
    /// # Panics
    ///
    /// Panics when the settings are not finite and non-negative, or the build rejects the corpus,
    /// which the synthesis contract excludes.
    #[must_use]
    pub fn build_in(&self, scratch: &mut Scratch, coincident: f32, pruning: f32) -> BuildSummary {
        let attraction = AttractionOptions::new(coincident, pruning)
            .expect("the sweep passes finite, non-negative settings");
        let indexes =
            RelationIndexes::build(self.rows(), self.policies(), &mut scratch.0, attraction)
                .expect("the synthesized corpus satisfies the build contract");

        BuildSummary {
            retained_edges: indexes.measurements.retained_edges,
            pruned_edges: indexes.measurements.pruned_edges,
            omitted_mass_fraction: indexes.measurements.omitted_mass_fraction(),
            protection_entries: indexes.protection.matrix().nnz(),
        }
    }

    /// Runs the group emission alone at `chunk` granularity.
    ///
    /// Reads the corpus's group-sorted instances and allocates the protection record buffer it
    /// fills, exactly as the production build does.
    ///
    /// # Panics
    ///
    /// Panics when the corpus references an uncovered relation, which the synthesis contract
    /// excludes.
    pub fn emit_groups(&self, chunk: usize) {
        let ranges = build::resolve_groups(self.grouped(), self.policies())
            .expect("the synthesized corpus covers every relation");
        let mut records = vec![ProtectionRecord::EMPTY; self.grouped().len()];
        drop(build::build_groups(
            self.grouped(),
            ranges,
            &mut records,
            AttractionOptions::default(),
            chunk,
        ));
    }

    /// Runs the protection assembly alone: the record sort, the aggregation, and the scatter.
    pub fn assemble_protection(&self, records: &mut Records) {
        drop(build::assemble_protection(self.rows(), &mut records.0));
    }

    /// Runs the protection index's validation alone, over the corpus's assembled index.
    ///
    /// Assembly constructs every invariant the validation re-checks; timing the check against
    /// [`assemble_protection`](Self::assemble_protection) attributes the assembly stage's cost
    /// between the scatter and the re-validation.
    ///
    /// # Panics
    ///
    /// Panics when the assembled matrix fails its own validation, which the scatter contract
    /// excludes.
    pub fn validate_protection(&self) {
        let matrix = self.protection().matrix();
        super::protection::validate(matrix).expect("the assembled matrix is valid");
    }
}
