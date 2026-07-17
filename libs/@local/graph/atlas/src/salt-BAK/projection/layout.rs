//! Alpha-ladder layout fitting and durable layout publication.
//!
//! [`fit_layout_ladder`] walks a descending ladder of alpha levels. Each rung
//! blends the semantic and relation graphs at its alpha, optimizes the layout
//! with the parallel UMAP optimizer, and warm-starts the next rung from the
//! finished coordinates, so consecutive levels stay visually aligned. Every
//! rung's layout is persisted as a native-endian `layout-aXXX.f32` file and
//! handed back as an mmap-backed matrix.
//!
//! [`fit_projectors`] then distills each persisted level into a projector,
//! chaining trained weights from rung to rung the same way the layouts chain
//! coordinates.

use core::{error::Error, fmt, num::NonZero};
use std::{
    collections::HashSet,
    fs::File,
    io::{self, BufWriter, Write as _},
    path::Path,
};

use burn::{module::Module as _, tensor::backend::AutodiffBackend};
use camino::{Utf8Path, Utf8PathBuf};
use tempfile::NamedTempFile;

use super::{
    graph::{GraphError, SparseGraph, blend_and_reset},
    mlp::{FittedProjector, Projector, ProjectorError, TrainingConfig},
    umap::{ParallelOptimizer, UmapError, UmapOptions, fit_curve_parameters},
};
use crate::float::FloatBytes;

/// A failure while fitting or publishing the layout ladder.
#[derive(Debug)]
pub enum LayoutError {
    /// Blending the semantic and relation graphs failed.
    Graph(GraphError),
    /// The UMAP optimizer rejected its inputs or configuration.
    Umap(UmapError),
    /// Writing a layout file failed.
    Io(io::Error),
    /// Publishing a layout file over its destination failed.
    Persist(tempfile::PersistError),
    /// The ladder contains no alpha values.
    EmptyAlphaLadder,
    /// An alpha value is outside `[0, 1]` or not finite.
    InvalidAlpha(f32),
    /// Two alpha values round to the same `aXXX` file tag.
    DuplicateAlphaTag(u16),
    /// The initial layout row count does not match the graphs.
    InitialRows { expected: usize, actual: usize },
}

impl fmt::Display for LayoutError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Graph(error) => error.fmt(formatter),
            Self::Umap(error) => error.fmt(formatter),
            Self::Io(error) => write!(formatter, "failed to persist Atlas layout: {error}"),
            Self::Persist(error) => write!(formatter, "failed to publish Atlas layout: {error}"),
            Self::EmptyAlphaLadder => formatter.write_str("layout alpha ladder must not be empty"),
            Self::InvalidAlpha(alpha) => {
                write!(
                    formatter,
                    "layout alpha must be finite and within [0, 1], got {alpha}"
                )
            }
            Self::DuplicateAlphaTag(tag) => write!(
                formatter,
                "multiple alpha values map to layout file tag a{tag:03}"
            ),
            Self::InitialRows { expected, actual } => write!(
                formatter,
                "initial layout has {actual} rows but the graph has {expected}"
            ),
        }
    }
}

impl Error for LayoutError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Graph(error) => Some(error),
            Self::Umap(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::EmptyAlphaLadder
            | Self::InvalidAlpha(_)
            | Self::DuplicateAlphaTag(_)
            | Self::InitialRows { .. } => None,
        }
    }
}

impl From<GraphError> for LayoutError {
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

impl From<UmapError> for LayoutError {
    fn from(error: UmapError) -> Self {
        Self::Umap(error)
    }
}

impl From<io::Error> for LayoutError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<tempfile::PersistError> for LayoutError {
    fn from(error: tempfile::PersistError) -> Self {
        Self::Persist(error)
    }
}

/// Configuration for [`fit_layout_ladder`].
///
/// The first rung runs a cold fit with the full epoch budget and learning
/// rate; every later rung warm-starts from the previous coordinates and uses
/// the smaller chained budget and rate.
#[derive(Debug, Clone)]
pub struct LayoutLadderOptions {
    /// Alpha levels to fit. Sorted descending before fitting, so the ladder
    /// always starts from the most semantic blend regardless of input order.
    pub alphas: Vec<f32>,
    /// Epoch budget for the first (cold) rung.
    pub first_epochs: usize,
    /// Epoch budget for every warm-started rung after the first.
    pub chained_epochs: usize,
    /// Initial learning rate for the cold rung.
    pub cold_learning_rate: f64,
    /// Initial learning rate for warm-started rungs.
    pub warm_learning_rate: f64,
    /// Distance below which layout points are considered ideally close; see
    /// [`fit_curve_parameters`].
    pub min_distance: f64,
    /// Scale of distances in the fitted layout; see [`fit_curve_parameters`].
    pub spread: f64,
    /// Weight of repulsive negative-sample updates.
    pub repulsion_strength: f64,
    /// Negative samples drawn per attractive update.
    pub negative_sample_rate: usize,
    /// Seed for the per-rung optimizer RNG states.
    pub seed: u64,
}

impl Default for LayoutLadderOptions {
    fn default() -> Self {
        Self {
            alphas: vec![1.0, 0.75, 0.5, 0.25, 0.0],
            first_epochs: 200,
            chained_epochs: 75,
            cold_learning_rate: 1.0,
            warm_learning_rate: 0.25,
            min_distance: 0.1,
            spread: 1.0,
            repulsion_strength: 1.0,
            negative_sample_rate: 5,
            seed: 42,
        }
    }
}

impl LayoutLadderOptions {
    /// Sorts the ladder descending and derives each rung's `aXXX` file tag.
    ///
    /// # Errors
    ///
    /// Returns an error when the ladder is empty, when an alpha is outside
    /// `[0, 1]`, or when two alphas collide on the same rounded tag (which
    /// would silently overwrite a layout file).
    fn validate(mut self) -> Result<(Self, Vec<u16>), LayoutError> {
        if self.alphas.is_empty() {
            return Err(LayoutError::EmptyAlphaLadder);
        }
        for &alpha in &self.alphas {
            if !alpha.is_finite() || !(0.0..=1.0).contains(&alpha) {
                return Err(LayoutError::InvalidAlpha(alpha));
            }
        }
        self.alphas.sort_unstable_by(f32::total_cmp);
        self.alphas.reverse();

        let mut tags = Vec::with_capacity(self.alphas.len());
        let mut unique = HashSet::with_capacity(self.alphas.len());
        for &alpha in &self.alphas {
            let tag = alpha_tag(alpha);
            if !unique.insert(tag) {
                return Err(LayoutError::DuplicateAlphaTag(tag));
            }
            tags.push(tag);
        }
        Ok((self, tags))
    }
}

/// The file tag of an alpha level: its percentage, rounded to the nearest
/// whole number.
///
/// Tags name layout and encoder files (`layout-a075.f32`, `encoder-a075`),
/// so two alphas within half a percent of each other collide; the ladder
/// validation rejects such ladders up front.
pub(super) fn alpha_tag(alpha: f32) -> u16 {
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "validated alpha percentages are within 0..=100"
    )]
    let tag = (alpha * 100.0).round() as u16;
    tag
}

/// One fitted and persisted rung of the alpha ladder.
pub struct LayoutLevel {
    /// The blend level this layout was fitted at.
    pub alpha: f32,
    /// The published `layout-aXXX.f32` file.
    pub path: Utf8PathBuf,
    /// The persisted coordinates, mmap-backed with two values per row.
    pub coordinates: FloatBytes,
}

/// Fits one layout per alpha level and publishes each as a native-endian
/// `layout-aXXX.f32` file under `out`.
///
/// Levels are fitted in descending alpha order and returned in that order.
/// Each rung's fused graph is dropped before the next is built, so at most
/// one fused graph is alive at a time. Publication uses temporary-file
/// hotswaps: an existing layout file is only replaced once its successor is
/// fully written and synced.
///
/// # Errors
///
/// Returns an error when the options are invalid, when the initial layout
/// length does not match the graphs, when blending or optimization fails, or
/// when a layout file cannot be written or published.
pub(crate) fn fit_layout_ladder(
    semantic: &SparseGraph,
    relation: &SparseGraph,
    initial_coordinates: Vec<[f32; 2]>,
    out: impl AsRef<Utf8Path>,
    options: LayoutLadderOptions,
) -> Result<Vec<LayoutLevel>, LayoutError> {
    let rows = semantic.rows();
    if initial_coordinates.len() != rows {
        return Err(LayoutError::InitialRows {
            expected: rows,
            actual: initial_coordinates.len(),
        });
    }
    let (options, tags) = options.validate()?;
    let curve = fit_curve_parameters(options.spread, options.min_distance)?;
    let mut levels = Vec::with_capacity(options.alphas.len());
    let mut initialization = initial_coordinates;

    for (rung, (&alpha, tag)) in options.alphas.iter().zip(tags).enumerate() {
        let rung_start = std::time::Instant::now();
        let graph = blend_and_reset(semantic, relation, alpha)?;
        let first = rung == 0;
        let optimizer_options = UmapOptions {
            epochs: if first {
                options.first_epochs
            } else {
                options.chained_epochs
            },
            initial_learning_rate: if first {
                options.cold_learning_rate
            } else {
                options.warm_learning_rate
            },
            repulsion_strength: options.repulsion_strength,
            negative_sample_rate: options.negative_sample_rate,
        };
        let fused_entries = graph.nnz();
        let mut optimizer = ParallelOptimizer::new(
            &graph,
            initialization,
            curve,
            optimizer_options,
            rung_random_state(options.seed, rung),
        )?;
        optimizer.run()?;
        initialization = optimizer.coordinates();

        let path = out.as_ref().join(format!("layout-a{tag:03}.f32"));
        persist_layout(&path, &initialization)?;
        tracing::info!(
            alpha,
            fused_entries,
            epochs = optimizer_options.epochs,
            duration_ms = u64::try_from(rung_start.elapsed().as_millis()).unwrap_or(u64::MAX),
            layout = %path,
            "layout rung fitted and published"
        );
        let file = File::open(&path)?;
        let coordinates = FloatBytes::from_file(
            file,
            NonZero::new(2).expect("layout dimension is statically positive"),
        )?;
        levels.push(LayoutLevel {
            alpha,
            path,
            coordinates,
        });
    }

    Ok(levels)
}

/// Writes coordinates to a temporary file, syncs it, and swaps it over
/// `path`.
///
/// The destination is never deleted first: a crash mid-publication leaves
/// the previous layout file intact.
fn persist_layout(path: &Utf8Path, coordinates: &[[f32; 2]]) -> Result<(), LayoutError> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("layout path {path} has no parent directory"),
        )
    })?;
    let temporary = NamedTempFile::new_in(parent)?;
    {
        let mut writer = BufWriter::new(temporary.as_file());
        for coordinate in coordinates {
            for value in coordinate {
                writer.write_all(&value.to_ne_bytes())?;
            }
        }
        writer.flush()?;
    }
    temporary.as_file().sync_all()?;
    temporary.persist(path)?;
    Ok(())
}

/// Derives a rung-specific optimizer RNG state via `SplitMix64`.
///
/// Each rung gets an independent, deterministic stream, so re-fitting the
/// same ladder reproduces the same layouts rung for rung.
fn rung_random_state(seed: u64, rung: usize) -> [i64; 3] {
    let mut state = seed.wrapping_add(rung as u64);
    core::array::from_fn(|_| {
        state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut value = state;
        value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        ((value ^ (value >> 31)) as u32).cast_signed() as i64
    })
}

/// Distills each fitted layout level into a [`Projector`], chaining weights
/// between rungs.
///
/// The first level trains with the caller's full epoch budget, starting
/// either from fresh weights or, when `initial` carries a previous refit's
/// encoder, from those weights. Every later level starts from the previous
/// level's trained standardized weights and uses `chained_epochs`, mirroring
/// how the layouts themselves warm-start. The returned projectors pair each
/// alpha with its fitted encoder on the inference backend, in ladder order.
///
/// # Errors
///
/// Returns an error when a level's training inputs or the configuration are
/// invalid, or when the best checkpoint cannot be restored; see
/// [`Projector::fit`].
pub(crate) fn fit_projectors<B: AutodiffBackend>(
    features: &FloatBytes,
    levels: &[LayoutLevel],
    initial: Option<Projector<B::InnerBackend>>,
    mut config: TrainingConfig,
    chained_epochs: usize,
    artifact_root: impl AsRef<Path>,
    device: &B::Device,
) -> Result<Vec<(f32, FittedProjector<B::InnerBackend>)>, ProjectorError> {
    let mut training_projector = initial.map_or_else(
        || Projector::<B>::new(features.dim(), device),
        |previous| previous.train::<B>(),
    );
    let mut projectors = Vec::with_capacity(levels.len());

    for level in levels {
        let rung_start = std::time::Instant::now();
        let artifact_dir = artifact_root
            .as_ref()
            .join(format!("a{:03}", alpha_tag(level.alpha)));
        let fitted = training_projector.fit(
            features.clone(),
            level.coordinates.clone(),
            config,
            artifact_dir,
            device,
        )?;
        tracing::info!(
            alpha = level.alpha,
            validation_rmse = fitted.validation_rmse,
            epochs = config.epochs,
            duration_ms = u64::try_from(rung_start.elapsed().as_millis()).unwrap_or(u64::MAX),
            "projector distilled; validation RMSE is in layout units"
        );
        training_projector = fitted.standardized.clone().train::<B>();
        projectors.push((level.alpha, fitted));
        config.epochs = chained_epochs;
    }

    Ok(projectors)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn graph(values: &[(u32, u32, f32)]) -> SparseGraph {
        let rows = values
            .iter()
            .flat_map(|&(left, right, _)| [left, right])
            .max()
            .unwrap() as usize
            + 1;
        let mut indptr = Vec::with_capacity(rows + 1);
        let mut indices = Vec::with_capacity(values.len());
        let mut data = Vec::with_capacity(values.len());
        let mut offset = 0;
        indptr.push(0);
        for row in 0..rows as u32 {
            while offset < values.len() && values[offset].0 == row {
                indices.push(values[offset].1);
                data.push(values[offset].2);
                offset += 1;
            }
            indptr.push(indices.len() as u32);
        }
        SparseGraph::new((rows, rows), indptr, indices, data)
    }

    #[test]
    fn fits_warm_started_ladder_and_publishes_native_layouts() {
        let semantic = graph(&[
            (0, 1, 1.0),
            (1, 0, 1.0),
            (1, 2, 0.8),
            (2, 1, 0.8),
            (2, 3, 1.0),
            (3, 2, 1.0),
        ]);
        let relation = graph(&[(0, 2, 1.0), (1, 3, 1.0), (2, 0, 1.0), (3, 1, 1.0)]);
        let directory = tempfile::tempdir().expect("output directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
        let levels = fit_layout_ladder(
            &semantic,
            &relation,
            vec![[0.0, 0.0], [0.2, 1.0], [0.8, 0.1], [1.0, 0.9]],
            out,
            LayoutLadderOptions {
                alphas: vec![0.0, 1.0, 0.5],
                first_epochs: 5,
                chained_epochs: 3,
                ..LayoutLadderOptions::default()
            },
        )
        .expect("layout ladder should fit");

        assert_eq!(
            levels.iter().map(|level| level.alpha).collect::<Vec<_>>(),
            [1.0, 0.5, 0.0]
        );
        assert_eq!(
            levels
                .iter()
                .map(|level| level.path.file_name().unwrap())
                .collect::<Vec<_>>(),
            ["layout-a100.f32", "layout-a050.f32", "layout-a000.f32"]
        );
        for level in levels {
            assert_eq!(level.coordinates.len(), 4);
            assert_eq!(level.coordinates.dim(), 2);
            assert!(
                level
                    .coordinates
                    .row(0)
                    .iter()
                    .all(|value| value.is_finite())
            );
            assert_eq!(std::fs::metadata(level.path).unwrap().len(), 4 * 2 * 4);
        }
    }
}
