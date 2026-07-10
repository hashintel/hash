use core::{error::Error, fmt, pin::pin};

use futures::TryStreamExt as _;
use type_system::knowledge::entity::id::EntityId;

use super::{
    graph::{GraphError, SparseGraph, elementwise_max, sparse_graph},
    sample::{Sample, SampleError},
};

#[derive(Debug)]
pub(crate) enum RelationGraphError {
    Sample(SampleError),
    Graph(GraphError),
    InvalidOption {
        name: &'static str,
        value: f64,
    },
    EdgeOutOfBounds {
        source: u32,
        target: u32,
        rows: usize,
    },
    UnsortedEdge {
        previous: (u32, u32),
        current: (u32, u32),
    },
    TooManyEdges(usize),
}

impl fmt::Display for RelationGraphError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sample(error) => error.fmt(formatter),
            Self::Graph(error) => error.fmt(formatter),
            Self::InvalidOption { name, value } => {
                write!(formatter, "invalid relation graph option {name}: {value}")
            }
            Self::EdgeOutOfBounds {
                source,
                target,
                rows,
            } => write!(
                formatter,
                "relation edge ({source}, {target}) is outside {rows} sampled rows"
            ),
            Self::UnsortedEdge { previous, current } => write!(
                formatter,
                "relation edge {current:?} is not strictly ordered after {previous:?}"
            ),
            Self::TooManyEdges(edges) => {
                write!(
                    formatter,
                    "{edges} relation edges cannot be represented by u32"
                )
            }
        }
    }
}

impl Error for RelationGraphError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sample(error) => Some(error),
            Self::Graph(error) => Some(error),
            Self::InvalidOption { .. }
            | Self::EdgeOutOfBounds { .. }
            | Self::UnsortedEdge { .. }
            | Self::TooManyEdges(_) => None,
        }
    }
}

impl From<SampleError> for RelationGraphError {
    fn from(error: SampleError) -> Self {
        Self::Sample(error)
    }
}

impl From<GraphError> for RelationGraphError {
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct RelationGraphOptions {
    pub(crate) hub_quantile: f64 = 0.9995,
    pub(crate) hub_min_ratio: f64 = 4.0,
    pub(crate) shared_neighbors: usize = 10,
    pub(crate) shared_weight: f32 = 1.0,
    pub(crate) hops: usize = 2,
    pub(crate) hop_decay: f32 = 0.5,
}

impl RelationGraphOptions {
    fn validate(self) -> Result<Self, RelationGraphError> {
        if !self.hub_quantile.is_finite() || !(0.0..=1.0).contains(&self.hub_quantile) {
            return Err(RelationGraphError::InvalidOption {
                name: "hub_quantile",
                value: self.hub_quantile,
            });
        }
        if !self.hub_min_ratio.is_finite() || self.hub_min_ratio < 0.0 {
            return Err(RelationGraphError::InvalidOption {
                name: "hub_min_ratio",
                value: self.hub_min_ratio,
            });
        }
        if !self.shared_weight.is_finite() || self.shared_weight < 0.0 {
            return Err(RelationGraphError::InvalidOption {
                name: "shared_weight",
                value: f64::from(self.shared_weight),
            });
        }
        if self.hops == 0 {
            return Err(RelationGraphError::InvalidOption {
                name: "hops",
                value: self.hops as f64,
            });
        }
        if !self.hop_decay.is_finite() || self.hop_decay < 0.0 {
            return Err(RelationGraphError::InvalidOption {
                name: "hop_decay",
                value: f64::from(self.hop_decay),
            });
        }
        Ok(self)
    }
}

pub(crate) struct RelationGraph {
    pub(crate) graph: SparseGraph,
    pub(crate) adjacency: SparseGraph,
    pub(crate) hubs: Vec<EntityId>,
}

pub(crate) async fn relation_graph(
    sample: &Sample<'_>,
    options: RelationGraphOptions,
) -> Result<RelationGraph, RelationGraphError> {
    let options = options.validate()?;
    let rows = sample.embeddings().len();
    if rows > u32::MAX as usize {
        return Err(GraphError::TooManyRows(rows).into());
    }

    let relations = sample
        .relations(options.hub_quantile, options.hub_min_ratio)
        .await?;
    let hubs = relations.hubs;
    let adjacency = adjacency_from_stream(rows, relations.edges).await?;
    let graph = build_relation_graph(&adjacency, options)?;

    Ok(RelationGraph {
        graph,
        adjacency,
        hubs,
    })
}

async fn adjacency_from_stream(
    rows: usize,
    edges: super::sample::QueryEdges<'_>,
) -> Result<SparseGraph, RelationGraphError> {
    let mut indptr = Vec::with_capacity(rows + 1);
    let mut indices = Vec::new();
    let mut current_row = 0_u32;
    let mut previous = None;
    indptr.push(0);

    let mut edges = pin!(edges);
    while let Some((source, target)) = edges.try_next().await? {
        if source as usize >= rows || target as usize >= rows {
            return Err(RelationGraphError::EdgeOutOfBounds {
                source,
                target,
                rows,
            });
        }
        if let Some(previous) = previous {
            if previous >= (source, target) {
                return Err(RelationGraphError::UnsortedEdge {
                    previous,
                    current: (source, target),
                });
            }
        }
        previous = Some((source, target));

        while current_row < source {
            indptr.push(
                u32::try_from(indices.len())
                    .map_err(|_error| RelationGraphError::TooManyEdges(indices.len()))?,
            );
            current_row += 1;
        }
        indices.push(target);
    }

    while current_row < rows as u32 {
        indptr.push(
            u32::try_from(indices.len())
                .map_err(|_error| RelationGraphError::TooManyEdges(indices.len()))?,
        );
        current_row += 1;
    }

    let values = vec![1.0; indices.len()];
    sparse_graph(rows, indptr, indices, values).map_err(From::from)
}

fn build_relation_graph(
    adjacency: &SparseGraph,
    options: RelationGraphOptions,
) -> Result<SparseGraph, RelationGraphError> {
    let rows = adjacency.rows();
    let indptr_view = adjacency.indptr();
    let pointers = indptr_view.raw_storage();
    let degrees = (0..rows)
        .map(|row| (pointers[row + 1] - pointers[row]) as usize)
        .collect::<Vec<_>>();
    let (indptr, indices, _) = adjacency.clone().into_raw_storage();
    let mut values = Vec::with_capacity(indices.len());

    for source in 0..rows {
        let start = indptr[source] as usize;
        let stop = indptr[source + 1] as usize;
        for &target in &indices[start..stop] {
            let degree_product = degrees[source] as f32 * degrees[target as usize] as f32;
            values.push(degree_product.sqrt().recip());
        }
    }

    let direct = sparse_graph(rows, indptr, indices, values)?;
    let mut combined = direct.clone();
    let mut power = direct.clone();

    if options.shared_neighbors > 0 && options.shared_weight > 0.0 {
        for hop in 2..=options.hops {
            power = bounded_product(&direct, &power, options.shared_neighbors)?;
            let transpose = power.transpose_view().to_csr();
            let mut shared = elementwise_max(&power, &transpose)?;
            let weight = options.shared_weight * options.hop_decay.powi(hop as i32 - 2);
            for value in shared.data_mut() {
                *value *= weight;
            }
            combined = elementwise_max(&combined, &shared)?;
        }
    }

    if let Some(maximum) = combined.data().iter().copied().reduce(f32::max)
        && maximum > 0.0
    {
        for value in combined.data_mut() {
            *value /= maximum;
        }
    }

    Ok(combined)
}

fn bounded_product(
    left: &SparseGraph,
    right: &SparseGraph,
    keep: usize,
) -> Result<SparseGraph, RelationGraphError> {
    debug_assert_eq!(left.shape(), right.shape());
    debug_assert!(keep > 0);

    let rows = left.rows();
    let mut indptr = Vec::with_capacity(rows + 1);
    let mut indices = Vec::with_capacity(rows.saturating_mul(keep));
    let mut values = Vec::with_capacity(rows.saturating_mul(keep));
    let mut accumulated = vec![0.0_f32; rows];
    let mut generations = vec![0_u32; rows];
    let mut generation = 0_u32;
    let mut touched = Vec::<u32>::new();
    indptr.push(0);

    for source in 0..rows {
        generation = generation.wrapping_add(1);
        if generation == 0 {
            generations.fill(0);
            generation = 1;
        }
        touched.clear();

        let left_row = left.outer_view(source).expect("source row is in bounds");
        for (&middle, &left_weight) in left_row.indices().iter().zip(left_row.data()) {
            let right_row = right
                .outer_view(middle as usize)
                .expect("intermediate row is in bounds");
            for (&target, &right_weight) in right_row.indices().iter().zip(right_row.data()) {
                let target_index = target as usize;
                if target_index == source {
                    continue;
                }
                if generations[target_index] != generation {
                    generations[target_index] = generation;
                    accumulated[target_index] = 0.0;
                    touched.push(target);
                }
                accumulated[target_index] += left_weight * right_weight;
            }
        }

        if touched.len() > keep {
            touched.select_nth_unstable_by(keep, |&left, &right| {
                accumulated[right as usize].total_cmp(&accumulated[left as usize])
            });
            touched.truncate(keep);
        }
        touched.sort_unstable();
        for &target in &touched {
            let value = accumulated[target as usize];
            if value > 0.0 {
                indices.push(target);
                values.push(value);
            }
        }
        indptr.push(
            u32::try_from(indices.len())
                .map_err(|_error| RelationGraphError::TooManyEdges(indices.len()))?,
        );
    }

    sparse_graph(rows, indptr, indices, values).map_err(From::from)
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io::BufReader, path::Path};

    use npyz::Deserialize;

    use super::*;

    fn read_npy<T: Deserialize>(relative: impl AsRef<Path>) -> Vec<T> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../tools/embedding2d/oracle/fixtures/v1/relation")
            .join(relative);
        let file = BufReader::new(File::open(path).expect("oracle fixture should open"));
        npyz::NpyFile::new(file)
            .expect("oracle fixture should parse")
            .into_vec::<T>()
            .expect("oracle data should parse")
    }

    fn read_oracle_graph(prefix: &str) -> SparseGraph {
        let indptr = read_npy::<i64>(format!("{prefix}-indptr.npy"));
        let indices = read_npy::<i64>(format!("{prefix}-indices.npy"));
        let values = read_npy::<f32>(format!("{prefix}-values.npy"));
        let rows = indptr.len() - 1;
        sparse_graph(
            rows,
            indptr.into_iter().map(|value| value as u32).collect(),
            indices.into_iter().map(|value| value as u32).collect(),
            values,
        )
        .expect("oracle graph should be valid")
    }

    fn graph(rows: usize, edges: &[(u32, u32)]) -> SparseGraph {
        let mut indptr = Vec::with_capacity(rows + 1);
        let mut indices = Vec::with_capacity(edges.len());
        indptr.push(0);
        let mut offset = 0;
        for row in 0..rows as u32 {
            while offset < edges.len() && edges[offset].0 == row {
                indices.push(edges[offset].1);
                offset += 1;
            }
            indptr.push(indices.len() as u32);
        }
        sparse_graph(rows, indptr, indices.clone(), vec![1.0; indices.len()])
            .expect("test graph should be valid")
    }

    #[test]
    fn matches_relation_graph_oracle() {
        let adjacency = read_oracle_graph("adjacency");
        let actual = build_relation_graph(
            &adjacency,
            RelationGraphOptions {
                hub_quantile: 0.75,
                hub_min_ratio: 1.8,
                shared_neighbors: 2,
                shared_weight: 1.0,
                hops: 2,
                hop_decay: 0.5,
            },
        )
        .expect("oracle relation graph should build");
        let expected = read_oracle_graph("combined");

        assert_eq!(
            actual.indptr().raw_storage(),
            expected.indptr().raw_storage()
        );
        assert_eq!(actual.indices(), expected.indices());
        for (&actual, &expected) in actual.data().iter().zip(expected.data()) {
            assert!(
                (actual - expected).abs() <= 2.0e-5,
                "{actual} != {expected}"
            );
        }
    }

    #[test]
    fn degree_normalizes_and_adds_bounded_shared_neighbors() {
        let adjacency = graph(
            5,
            &[
                (0, 1),
                (0, 2),
                (1, 0),
                (1, 2),
                (1, 3),
                (2, 0),
                (2, 1),
                (3, 1),
                (3, 4),
                (4, 3),
            ],
        );
        let relation = build_relation_graph(
            &adjacency,
            RelationGraphOptions {
                shared_neighbors: 1,
                shared_weight: 1.0,
                hops: 2,
                ..RelationGraphOptions::default()
            },
        )
        .expect("relation graph should build");

        assert_eq!(relation.shape(), (5, 5));
        assert!(relation.nnz() <= adjacency.nnz() + adjacency.rows() * 2);
        assert_eq!(relation.data().iter().copied().reduce(f32::max), Some(1.0));
        for (row, vector) in relation.outer_iterator().enumerate() {
            assert!(vector.nnz() <= adjacency.outer_view(row).unwrap().nnz() + 2);
            for (column, &weight) in vector.iter() {
                assert_ne!(row, column);
                assert_eq!(relation.get(column, row), Some(&weight));
                assert!(weight.is_finite() && weight > 0.0 && weight <= 1.0);
            }
        }
    }

    #[test]
    fn bounded_product_prunes_before_symmetrization() {
        let left = graph(
            6,
            &[
                (0, 1),
                (0, 2),
                (0, 3),
                (1, 4),
                (2, 4),
                (2, 5),
                (3, 5),
                (4, 0),
                (5, 0),
            ],
        );
        let product = bounded_product(&left, &left, 1).expect("product should build");

        for row in product.outer_iterator() {
            assert!(row.nnz() <= 1);
        }
        assert!(product.outer_iterator().enumerate().all(|(row, vector)| {
            vector
                .indices()
                .iter()
                .all(|&column| row != column as usize)
        }));
    }
}
