//! Exact brute-force k-nearest-neighbour list construction on a tensor backend.
//!
//! [`BruteForce`] computes every pairwise cosine similarity as tiled matrix products and keeps
//! each row's best `width` through a running top-k merge, so the full similarity matrix never
//! materializes. The result is exact under f32 accumulation: no sampling, no convergence, no
//! recall question beyond float rounding at near-ties. The backend decides where the arithmetic
//! runs; on a GPU backend the tile products are the workload the hardware is built for, and the
//! host only ever sees `width` winners per row.
//!
//! # Shape of one tile
//!
//! Row tiles walk the corpus in [`row_tile`](BruteForceOptions::row_tile)-sized bands; within a
//! band, column chunks of [`column_chunk`](BruteForceOptions::column_chunk) columns are scored by
//! one `tile @ chunkᵀ` product, self-similarity is masked below the cosine floor, and the chunk's
//! top `width` merge into the band's running winners by concatenation and re-selection. Chunk
//! results stay on the device; only the final winners of a band transfer.

use core::{error::Error, fmt, num::NonZero};

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use rand::{Rng, SeedableRng};

use super::{
    Neighbour,
    construction::{KnnConstruction, NeighbourLists},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::{Identity as _, NodeRowId},
    math::AlignedVecN,
};

// A 1024 x 65536 f32 similarity tile is 256 MiB of device memory,
// bounding the peak footprint at the corpus matrix plus two tiles.
const DEFAULT_ROW_TILE: usize = 1024;
const DEFAULT_COLUMN_CHUNK: usize = 1 << 16;

/// Pinned brute-force tiling settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BruteForceOptions {
    /// Corpus rows scored per band.
    pub row_tile: usize = DEFAULT_ROW_TILE,
    /// Corpus columns scored per tile product.
    pub column_chunk: usize = DEFAULT_COLUMN_CHUNK,
}

const impl Default for BruteForceOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The brute-force construction failed.
#[derive(Debug)]
pub(crate) enum BruteForceError {
    /// The corpus holds fewer than two rows.
    InsufficientRows { rows: usize },
    /// The row domain exceeds the lists' `u32` id encoding.
    TooManyRows { rows: usize },
}

impl fmt::Display for BruteForceError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InsufficientRows { rows } => {
                write!(fmt, "a {rows}-row corpus cannot form neighbour lists")
            }
            Self::TooManyRows { rows } => {
                write!(fmt, "{rows} rows exceed the lists' u32 id encoding")
            }
        }
    }
}

impl Error for BruteForceError {}

/// Pulls one band's winners to the host and fills its list rows in `(distance, id)` order.
fn drain_band<B: Backend>(
    slots: &mut [Neighbour],
    values: Tensor<B, 2>,
    ids: Tensor<B, 2, Int>,
    width: usize,
) {
    let values: Vec<f32> = values
        .into_data()
        .convert::<f32>()
        .to_vec()
        .expect("the winners convert to f32");
    let ids: Vec<i64> = ids
        .into_data()
        .convert::<i64>()
        .to_vec()
        .expect("the winner ids convert to i64");

    for (row, band) in slots.chunks_mut(width).enumerate() {
        for (slot, position) in band.iter_mut().zip(row * width..(row + 1) * width) {
            #[expect(
                clippy::cast_sign_loss,
                reason = "winner ids come from the non-negative arange over the row domain"
            )]
            let id = NodeRowId::new(ids[position] as u64);
            *slot = Neighbour {
                id,
                distance: (1.0 - values[position]).clamp(0.0, 2.0),
            };
        }
        band.sort_unstable_by(|left, right| {
            left.distance
                .total_cmp(&right.distance)
                .then_with(|| left.id.cmp(&right.id))
        });
    }
}

/// Exact tiled-product list constructor over a tensor backend.
#[derive(Debug, Clone)]
pub(crate) struct BruteForce<B: Backend> {
    device: B::Device,
    options: BruteForceOptions,
}

impl<B: Backend> BruteForce<B> {
    /// Wraps a device and pinned options.
    pub(crate) const fn new(device: B::Device, options: BruteForceOptions) -> Self {
        Self { device, options }
    }
}

impl<B: Backend> KnnConstruction for BruteForce<B> {
    type Error = BruteForceError;

    fn construct(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        width: NonZero<usize>,
        _rng: impl Rng + SeedableRng,
    ) -> Result<NeighbourLists, Self::Error> {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(BruteForceError::InsufficientRows { rows });
        }
        if u32::try_from(rows - 1).is_err() {
            return Err(BruteForceError::TooManyRows { rows });
        }
        let width = width.get().min(rows - 1);
        let row_tile = self.options.row_tile.max(1);
        let column_chunk = self.options.column_chunk.max(width + 1);

        // One upload of the corpus matrix; the transposed form is the
        // right-hand side of every tile product.
        let flat: Vec<f32> = embeddings
            .iter()
            .flat_map(|row| row.as_array().iter().copied())
            .collect();
        let corpus = Tensor::<B, 2>::from_data(
            TensorData::new(flat, [rows, PROJECTOR_DIMENSIONS]),
            &self.device,
        );
        let corpus_transposed = corpus.clone().transpose();

        let placeholder = Neighbour {
            id: NodeRowId::new(0),
            distance: 0.0,
        };
        let mut entries = vec![placeholder; rows * width].into_boxed_slice();

        for tile_start in (0..rows).step_by(row_tile) {
            let tile_end = (tile_start + row_tile).min(rows);
            let tile = corpus
                .clone()
                .slice([tile_start..tile_end, 0..PROJECTOR_DIMENSIONS]);
            let tile_rows = tile_end - tile_start;
            #[expect(
                clippy::cast_possible_wrap,
                reason = "the construction rejects row domains beyond u32 at entry"
            )]
            let row_ids =
                Tensor::<B, 1, Int>::arange(tile_start as i64..tile_end as i64, &self.device)
                    .reshape([tile_rows, 1]);

            // The band's running winners: similarities and global ids.
            let mut best: Option<(Tensor<B, 2>, Tensor<B, 2, Int>)> = None;
            for chunk_start in (0..rows).step_by(column_chunk) {
                let chunk_end = (chunk_start + column_chunk).min(rows);
                let columns = chunk_end - chunk_start;
                let product = tile.clone().matmul(
                    corpus_transposed
                        .clone()
                        .slice([0..PROJECTOR_DIMENSIONS, chunk_start..chunk_end]),
                );

                // Self-similarity sinks below the cosine floor of -1,
                // so a row can never select itself.
                #[expect(
                    clippy::cast_possible_wrap,
                    reason = "the construction rejects row domains beyond u32 at entry"
                )]
                let column_ids =
                    Tensor::<B, 1, Int>::arange(chunk_start as i64..chunk_end as i64, &self.device)
                        .reshape([1, columns]);
                let is_self = row_ids
                    .clone()
                    .expand([tile_rows, columns])
                    .equal(column_ids.clone().expand([tile_rows, columns]));
                let product = product.mask_fill(is_self, -2.0);

                let (values, local) = product.topk_with_indices(width.min(columns), 1);
                let ids = column_ids.expand([tile_rows, columns]).gather(1, local);

                best = Some(match best {
                    None => (values, ids),
                    Some((best_values, best_ids)) => {
                        let merged_values = Tensor::cat(vec![best_values, values], 1);
                        let merged_ids = Tensor::cat(vec![best_ids, ids], 1);
                        let (kept, selection) = merged_values.topk_with_indices(width, 1);
                        (kept, merged_ids.gather(1, selection))
                    }
                });
            }

            let tile_started = std::time::Instant::now();
            let (values, ids) = best.expect("a corpus of at least two rows yields chunks");
            drain_band(
                &mut entries[tile_start * width..tile_end * width],
                values,
                ids,
                width,
            );
            tracing::debug!(
                tile_start,
                wall_s = tile_started.elapsed().as_secs_f64(),
                "tile drained"
            );
        }

        Ok(NeighbourLists::new(entries, width))
    }
}
