//! The NN-Descent construction audit over a published generation.
//!
//! Constructions run at the production width - the wider of the spot check's depth and the stored
//! neighbour count - replaying the production fit's `knn-link` stream per seed, and one exact
//! reference scores every reading. A repeated seed measures construction nondeterminism; a
//! candidate cap is the knob the audit sweeps.

use core::{
    convert::Infallible,
    fmt::{self, Display},
    time::Duration,
};
use std::time::Instant;

use super::{AuditError, REFERENCE_ROWS, Seconds, open_representations, representation_rows};
use crate::{
    file::generation::{GenerationId, GenerationRoot},
    salt::{
        fit::{Stage, stage_rng},
        knn::{
            DEFAULT_NEIGHBOURS,
            construction::KnnConstruction as _,
            descent::{NnDescent, NnDescentError, NnDescentOptions},
            recall::{ExactReference, SpotCheckOptions},
        },
    },
};

/// Fit seeds the audit replays by default: two distinct seeds, one of them twice, so the readings
/// carry construction nondeterminism as well as seed spread.
pub(crate) const DEFAULT_SEEDS: &[u64] = &[0, 0, 1];
/// Candidate caps audited by default: the constructor's own setting, so a bare invocation reads
/// the deployed construction.
pub(crate) const DEFAULT_CANDIDATES: &[usize] = &[NnDescentOptions::default().maximum_candidates];

/// One NN-Descent construction reading.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Reading {
    /// The fit seed whose `knn-link` stream drove the construction.
    pub seed: u64,
    /// The candidate cap the construction ran at.
    pub maximum_candidates: usize,
    /// Wall clock of the construction.
    pub construct_wall: Duration,
    /// Aggregate recall@50 against the exact reference.
    pub recall: f64,
}

/// One finished audit: the corpus identity and every reading.
#[derive(Debug, Clone)]
pub(crate) struct Audit {
    /// The measured generation's identity.
    pub generation: GenerationId,
    /// The corpus row count.
    pub rows: usize,
    /// Sampled query rows of the reference.
    pub sampled_rows: usize,
    /// Exact neighbours compared per query: the `k` of recall@k.
    pub neighbours: usize,
    /// Wall clock of the brute-force reference (parallel).
    pub reference_wall: Duration,
    /// One entry per (seed, candidate cap), in grid order.
    pub readings: Vec<Reading>,
}

impl Display for Audit {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            fmt,
            "generation  {}  rows {}  recall@{} over {} sampled queries",
            self.generation, self.rows, self.neighbours, self.sampled_rows,
        )?;
        writeln!(
            fmt,
            "reference   {} brute force",
            Seconds::new(self.reference_wall)
        )?;

        writeln!(fmt)?;
        writeln!(fmt, "seed  candidates  construct wall   recall")?;
        for reading in &self.readings {
            writeln!(
                fmt,
                "{:<5} {:<11} {:>14}   {:.4}",
                reading.seed,
                reading.maximum_candidates,
                Seconds::new(reading.construct_wall),
                reading.recall,
            )?;
        }

        Ok(())
    }
}

/// Audits NN-Descent constructions over the active generation's representations.
///
/// # Errors
///
/// Returns an [`AuditError`] when the representations cannot be read, the reference cannot be
/// computed, or a construction fails.
pub(crate) fn audit(
    root: &GenerationRoot,
    seeds: &[u64],
    candidates: &[usize],
) -> Result<Audit, AuditError<NnDescentError>> {
    let (id, file) = open_representations(root).map_err(AuditError::Setup)?;
    let embeddings = representation_rows(&file).map_err(AuditError::Setup)?;

    let check = SpotCheckOptions::default();
    let width = check.neighbours.max(DEFAULT_NEIGHBOURS);

    let started = Instant::now();
    let reference = ExactReference::new::<Infallible>(
        embeddings,
        check.neighbours,
        REFERENCE_ROWS,
        stage_rng(seeds.first().copied().unwrap_or(0), Stage::RecallCheck),
    )
    .map_err(AuditError::Reference)?;
    let reference_wall = started.elapsed();
    tracing::info!(
        wall_s = reference_wall.as_secs_f64(),
        "exact reference computed"
    );

    let mut readings = Vec::new();
    for &seed in seeds {
        for &maximum_candidates in candidates {
            let started = Instant::now();
            let lists = NnDescent::new(NnDescentOptions {
                maximum_candidates,
                ..
            })
            .construct(embeddings, width, stage_rng(seed, Stage::KnnLink))
            .map_err(AuditError::Construct)?;
            let construct_wall = started.elapsed();

            let reading = reference.score_lists(&lists);
            tracing::info!(
                seed,
                maximum_candidates,
                wall_s = construct_wall.as_secs_f64(),
                recall = reading.recall(),
                "construction read"
            );
            readings.push(Reading {
                seed,
                maximum_candidates,
                construct_wall,
                recall: reading.recall(),
            });
        }
    }

    Ok(Audit {
        generation: id,
        rows: embeddings.len(),
        sampled_rows: reference.sampled_rows(),
        neighbours: reference.neighbours_per_row(),
        reference_wall,
        readings,
    })
}
