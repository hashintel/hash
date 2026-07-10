use core::num::NonZero;
use std::{
    fs::File,
    io::{BufReader, Write as _},
    path::{Path, PathBuf},
};

use npyz::Deserialize;

use super::{
    SparseGraph, blend_and_reset,
    fuzzy::{fuzzy_graph, membership_strengths, smooth_knn_distances},
    knn::{Knn, SemanticGraphOptions, semantic_graph, semantic_knn},
};
use crate::{float::FloatBytes, macros::nz};

const FLOAT_TOLERANCE: f32 = 2.0e-5;

fn fixture_path(relative: impl AsRef<Path>) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../tools/embedding2d/oracle/fixtures/v1")
        .join(relative)
}

fn read_npy<T: Deserialize>(relative: impl AsRef<Path>) -> (Vec<u64>, Vec<T>) {
    let file = BufReader::new(File::open(fixture_path(relative)).expect("fixture should open"));
    let npy = npyz::NpyFile::new(file).expect("fixture header should parse");
    let shape = npy.shape().to_vec();
    let values = npy.into_vec::<T>().expect("fixture data should parse");
    (shape, values)
}

fn read_graph(prefix: &str) -> SparseGraph {
    let (_, indptr) = read_npy::<i64>(format!("{prefix}-indptr.npy"));
    let (_, indices) = read_npy::<i64>(format!("{prefix}-indices.npy"));
    let (_, values) = read_npy::<f32>(format!("{prefix}-values.npy"));
    let rows = indptr.len() - 1;

    SparseGraph::new(
        (rows, rows),
        indptr
            .into_iter()
            .map(|value| u32::try_from(value).expect("fixture pointer should fit u32"))
            .collect(),
        indices
            .into_iter()
            .map(|value| u32::try_from(value).expect("fixture index should fit u32"))
            .collect(),
        values,
    )
}

fn assert_close(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (offset, (&actual, &expected)) in actual.iter().zip(expected).enumerate() {
        assert!(
            (actual - expected).abs() <= FLOAT_TOLERANCE,
            "value {offset} differs: {actual} != {expected}"
        );
    }
}

fn assert_graph(actual: &SparseGraph, expected_prefix: &str) {
    let expected = read_graph(expected_prefix);
    assert_eq!(actual.shape(), expected.shape());
    assert_eq!(
        actual.indptr().raw_storage(),
        expected.indptr().raw_storage()
    );
    assert_eq!(actual.indices(), expected.indices());
    assert_close(actual.data(), expected.data());
}

fn mmap_embeddings<const DIM: usize>(rows: &[[f32; DIM]]) -> FloatBytes {
    let mut file = tempfile::tempfile().expect("temporary embedding file should open");
    for row in rows {
        for value in row {
            file.write_all(&value.to_ne_bytes())
                .expect("embedding should write");
        }
    }
    file.flush().expect("embeddings should flush");
    FloatBytes::from_file(file, NonZero::new(DIM).expect("test dimension is positive"))
        .expect("embeddings should mmap")
}

fn semantic_knn_fixture() -> Knn {
    let (shape, indices) = read_npy::<i64>("semantic/knn-indices.npy");
    let (_, distances) = read_npy::<f32>("semantic/knn-distances.npy");
    let rows = usize::try_from(shape[0]).expect("row count should fit usize");
    let neighbors = usize::try_from(shape[1]).expect("neighbor count should fit usize");

    Knn::new(
        rows,
        neighbors,
        indices
            .into_iter()
            .map(|index| u32::try_from(index).expect("neighbor index should fit u32"))
            .collect(),
        distances,
    )
    .expect("oracle k-NN should be valid")
}

#[test]
fn builds_knn_from_mmap_with_usearch() {
    let embeddings = mmap_embeddings(&[
        [1.0, 0.0, 0.0],
        [0.99, 0.01, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ]);
    let knn = semantic_knn(
        &embeddings,
        SemanticGraphOptions {
            neighbors: nz!(3),
            expansion_search: nz!(8),
            ..
        },
    )
    .expect("USearch should build a k-NN result");

    assert_eq!(knn.rows(), 4);
    assert_eq!(knn.neighbors(), 3);
    for row in 0..knn.rows() {
        let start = row * knn.neighbors();
        let stop = start + knn.neighbors();
        assert_eq!(knn.indices()[start], row as u32);
        assert_eq!(knn.distances()[start], 0.0);
        assert!(knn.indices()[start..stop].iter().all(|&index| index < 4));
        assert!(
            knn.distances()[start..stop]
                .windows(2)
                .all(|pair| pair[0] <= pair[1])
        );
    }

    let graph = semantic_graph(
        &embeddings,
        SemanticGraphOptions {
            neighbors: nz!(3),
            expansion_search: nz!(8),
            ..
        },
    )
    .expect("semantic graph should build");
    assert_eq!(graph.shape(), (4, 4));
    for (row, vector) in graph.outer_iterator().enumerate() {
        for (column, &weight) in vector.iter() {
            assert_eq!(graph.get(column, row), Some(&weight));
            assert!((0.0..=1.0).contains(&weight));
        }
    }
}

#[test]
fn repairs_self_neighbor_without_allocating_per_row() {
    let knn = Knn::new(
        4,
        3,
        vec![1, 0, 2, 0, 2, 3, 2, 1, 3, 3, 2, 1],
        vec![0.0, 0.0, 1.0, 0.2, 0.4, 0.8, 0.0, 0.4, 0.7, 0.0, 0.3, 0.6],
    )
    .expect("k-NN should be repairable");

    assert_eq!(knn.indices(), &[0, 1, 2, 1, 0, 2, 2, 1, 3, 3, 2, 1]);
    assert_eq!(
        knn.distances(),
        &[0.0, 0.0, 1.0, 0.0, 0.2, 0.4, 0.0, 0.4, 0.7, 0.0, 0.3, 0.6]
    );
}

#[test]
fn matches_semantic_graph_oracle() {
    let knn = semantic_knn_fixture();
    let smooth = smooth_knn_distances(&knn, 1.0, 1.0).expect("parameters are valid");
    let (_, expected_sigmas) = read_npy::<f32>("semantic/sigmas.npy");
    let (_, expected_rhos) = read_npy::<f32>("semantic/rhos.npy");
    assert_close(smooth.sigmas(), &expected_sigmas);
    assert_close(smooth.rhos(), &expected_rhos);

    let memberships = membership_strengths(&knn, &smooth);
    let (_, expected_memberships) = read_npy::<f32>("semantic/membership-values.npy");
    assert_close(&memberships, &expected_memberships);

    let graph = fuzzy_graph(&knn, &smooth).expect("oracle graph should be valid");
    assert_graph(&graph, "semantic/fuzzy-union");
}

#[test]
fn matches_fusion_and_local_connectivity_oracle() {
    let semantic = read_graph("fusion/semantic");
    let relation = read_graph("fusion/relation");

    for (alpha, expected) in [
        (1.0, "fusion/fused-a100"),
        (0.65, "fusion/fused-a065"),
        (0.0, "fusion/fused-a000"),
    ] {
        let fused = blend_and_reset(&semantic, &relation, alpha)
            .expect("oracle graphs and alpha should be valid");
        assert_graph(&fused, expected);
    }
}
