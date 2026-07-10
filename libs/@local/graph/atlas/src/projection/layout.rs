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
    mlp::{Projector, TrainingConfig},
    umap::{ParallelOptimizer, SerialUmapOptions, UmapError, fit_curve_parameters},
};
use crate::float::FloatBytes;

#[derive(Debug)]
pub(crate) enum LayoutError {
    Graph(GraphError),
    Umap(UmapError),
    Io(io::Error),
    Persist(tempfile::PersistError),
    EmptyAlphaLadder,
    InvalidAlpha(f32),
    DuplicateAlphaTag(u16),
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

#[derive(Debug, Clone)]
pub(crate) struct LayoutLadderOptions {
    pub(crate) alphas: Vec<f32>,
    pub(crate) first_epochs: usize,
    pub(crate) chained_epochs: usize,
    pub(crate) cold_learning_rate: f64,
    pub(crate) warm_learning_rate: f64,
    pub(crate) min_distance: f64,
    pub(crate) spread: f64,
    pub(crate) repulsion_strength: f64,
    pub(crate) negative_sample_rate: usize,
    pub(crate) seed: u64,
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
            #[expect(
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "validated alpha percentages are within 0..=100"
            )]
            let tag = (alpha * 100.0).round() as u16;
            if !unique.insert(tag) {
                return Err(LayoutError::DuplicateAlphaTag(tag));
            }
            tags.push(tag);
        }
        Ok((self, tags))
    }
}

pub(crate) struct LayoutLevel {
    pub(crate) alpha: f32,
    pub(crate) path: Utf8PathBuf,
    pub(crate) coordinates: FloatBytes,
}

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
        let graph = blend_and_reset(semantic, relation, alpha)?;
        let first = rung == 0;
        let optimizer_options = SerialUmapOptions {
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

pub(crate) fn fit_projectors<B: AutodiffBackend>(
    features: FloatBytes,
    levels: &[LayoutLevel],
    mut config: TrainingConfig,
    chained_epochs: usize,
    artifact_root: impl AsRef<Path>,
    device: &B::Device,
) -> Vec<(f32, Projector<B::InnerBackend>)> {
    let mut training_projector = Projector::<B>::new(features.dim(), device);
    let mut projectors = Vec::with_capacity(levels.len());

    for level in levels {
        let artifact_dir = artifact_root
            .as_ref()
            .join(format!("a{:03}", (level.alpha * 100.0).round() as u16));
        let projector = training_projector.fit(
            features.clone(),
            level.coordinates.clone(),
            config,
            artifact_dir,
            device,
        );
        training_projector = projector.clone().train::<B>();
        projectors.push((level.alpha, projector));
        config.epochs = chained_epochs;
    }

    projectors
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
