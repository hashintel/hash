use super::{KnnTable, SemanticEdgeWeights};

const SMOOTH_K_TOLERANCE: f32 = 1.0e-5;
const MIN_K_DIST_SCALE: f32 = 1.0e-3;

/// Computes symmetric fuzzy-membership weights for a persisted k-neighbor table.
///
/// Each row receives a local connectivity radius `rho` and a bandwidth `sigma`
/// whose exponential memberships sum to `log2(k)`. Directed memberships are
/// combined with the probabilistic union
///
/// ```text
/// w(i, j) = p(i -> j) + p(j -> i) - p(i -> j) * p(j -> i).
/// ```
///
/// The returned values remain parallel to the directed neighbor table. A
/// one-sided edge therefore keeps its directed membership.
#[expect(
    clippy::cast_precision_loss,
    reason = "f32 operation order follows the established UMAP fuzzy-set kernel"
)]
pub(crate) fn fuzzy_edge_weights(table: &KnnTable) -> SemanticEdgeWeights {
    let neighbors = table.neighbors();
    let rows = table.rows();
    let target = (neighbors as f32).log2();
    let global_mean = mean(
        (0..rows).flat_map(|row| table.distances(row)).copied(),
        rows * neighbors,
    );
    let mut directed = Vec::with_capacity(rows * neighbors);
    for row in 0..rows {
        let distances = table.distances(row);
        let rho = distances
            .iter()
            .copied()
            .find(|distance| *distance > 0.0)
            .unwrap_or(0.0);
        let mut low = 0.0_f32;
        let mut high = f32::MAX;
        let mut sigma = 1.0_f32;
        for _ in 0..64 {
            let sum = distances
                .iter()
                .copied()
                .map(|distance| {
                    let adjusted = distance - rho;
                    if adjusted > 0.0 {
                        (-adjusted / sigma).exp()
                    } else {
                        1.0
                    }
                })
                .sum::<f32>();
            if (sum - target).abs() < SMOOTH_K_TOLERANCE {
                break;
            }
            if sum > target {
                high = sigma;
                sigma = (low + high) / 2.0;
            } else {
                low = sigma;
                sigma = if high == f32::MAX {
                    sigma * 2.0
                } else {
                    (low + high) / 2.0
                };
            }
        }
        let row_mean = mean(distances.iter().copied(), distances.len());
        sigma = sigma.max(MIN_K_DIST_SCALE * if rho > 0.0 { row_mean } else { global_mean });
        directed.extend(distances.iter().copied().map(|distance| {
            let adjusted = distance - rho;
            if adjusted <= 0.0 {
                1.0
            } else {
                (-adjusted / sigma).exp().max(f32::MIN_POSITIVE)
            }
        }));
    }

    let mut symmetric = directed.clone();
    for row in 0..rows {
        for offset in 0..neighbors {
            let position = row * neighbors + offset;
            let neighbor = usize::try_from(table.indices(row)[offset])
                .expect("validated neighbor row should fit usize");
            let reverse = table
                .indices(neighbor)
                .iter()
                .position(|candidate| {
                    *candidate == u32::try_from(row).expect("validated row should fit u32")
                })
                .map(|reverse_offset| directed[neighbor * neighbors + reverse_offset])
                .unwrap_or(0.0);
            let forward = directed[position];
            symmetric[position] = forward.mul_add(1.0 - reverse, reverse);
        }
    }
    SemanticEdgeWeights::new(table, symmetric)
        .expect("fuzzy weights derived from a validated table should validate")
}

#[inline]
#[expect(
    clippy::cast_precision_loss,
    reason = "neighbor tables remain below exact f32 integer precision in supported corpora"
)]
fn mean(values: impl Iterator<Item = f32>, count: usize) -> f32 {
    values.sum::<f32>() / count as f32
}
