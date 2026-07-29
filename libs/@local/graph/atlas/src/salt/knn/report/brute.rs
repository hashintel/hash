//! The exact brute-force construction audit over a published generation.
//!
//! One construction at the production width - the wider of the spot check's depth and the stored
//! neighbour count - scored against one exact CPU reference. The construction is deterministic, so
//! no seed grid exists; the reference measures f32-accumulation drift at near-ties rather than
//! approximation. A row bound audits the corpus prefix: both the rows and the candidate columns
//! shrink, so full-corpus wall extrapolates quadratically from a bounded reading.

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
            brute::{BruteForce, BruteForceError, BruteForceOptions},
            construction::KnnConstruction as _,
            recall::{ExactReference, SpotCheckOptions},
        },
    },
};

// The audit's tensor backend: the unfused CubeCL Metal runtime under
// `gpu` (the fused alias trips burn-fusion's stream ordering on dynamic
// shapes), the CPU tensor backend otherwise.
#[cfg(feature = "gpu")]
type Backend = burn::backend::wgpu::CubeBackend<burn::backend::wgpu::WgpuRuntime, f32, i32, u8>;
#[cfg(not(feature = "gpu"))]
type Backend = burn::backend::NdArray;

#[cfg(feature = "gpu")]
fn device() -> burn::backend::wgpu::WgpuDevice {
    burn::backend::wgpu::WgpuDevice::default()
}

#[cfg(not(feature = "gpu"))]
fn device() -> burn::backend::ndarray::NdArrayDevice {
    burn::backend::ndarray::NdArrayDevice::default()
}

/// One finished audit: the corpus identity and the reading.
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
    /// Wall clock of the brute-force reference (parallel, CPU).
    pub reference_wall: Duration,
    /// Wall clock of the tiled-product construction.
    pub construct_wall: Duration,
    /// Aggregate recall@50 against the exact reference.
    pub recall: f64,
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
            "reference   {} brute force (CPU, sampled)",
            Seconds::new(self.reference_wall),
        )?;

        writeln!(fmt)?;
        write!(
            fmt,
            "construct   {}   recall {:.4}",
            Seconds::new(self.construct_wall),
            self.recall,
        )
    }
}

/// Audits the exact brute-force construction over the active generation's representations.
///
/// `rows_limit` bounds the audited corpus prefix; the whole corpus is audited without one. The
/// tensor backend is the Metal-backed `CubeCL` runtime under the `gpu` feature and the CPU backend
/// otherwise.
///
/// # Errors
///
/// Returns an [`AuditError`] when the representations cannot be read, the reference cannot be
/// computed, or the construction fails.
pub(crate) fn audit(
    root: &GenerationRoot,
    rows_limit: Option<usize>,
) -> Result<Audit, AuditError<BruteForceError>> {
    let (id, file) = open_representations(root).map_err(AuditError::Setup)?;
    let embeddings = representation_rows(&file).map_err(AuditError::Setup)?;
    let embeddings = rows_limit.map_or(embeddings, |limit| {
        &embeddings[..limit.min(embeddings.len())]
    });

    let check = SpotCheckOptions::default();
    let width = check.neighbours.max(DEFAULT_NEIGHBOURS);

    let started = Instant::now();
    let reference = ExactReference::new::<Infallible>(
        embeddings,
        check.neighbours,
        REFERENCE_ROWS,
        stage_rng(0, Stage::RecallCheck),
    )
    .map_err(AuditError::Reference)?;
    let reference_wall = started.elapsed();
    tracing::info!(
        wall_s = reference_wall.as_secs_f64(),
        "exact reference computed"
    );

    let started = Instant::now();
    let lists = BruteForce::<Backend>::new(device(), BruteForceOptions::default())
        .construct(embeddings, width, stage_rng(0, Stage::KnnLink))
        .map_err(AuditError::Construct)?;
    let construct_wall = started.elapsed();

    let reading = reference.score_lists(&lists);
    tracing::info!(
        wall_s = construct_wall.as_secs_f64(),
        recall = reading.recall(),
        "construction read"
    );

    Ok(Audit {
        generation: id,
        rows: embeddings.len(),
        sampled_rows: reference.sampled_rows(),
        neighbours: reference.neighbours_per_row(),
        reference_wall,
        construct_wall,
        recall: reading.recall(),
    })
}
