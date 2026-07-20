use core::num::NonZeroUsize;

use camino::Utf8PathBuf;
use tempfile::tempdir;

use crate::salt::{
    graph::{
        KnnTable, Neighbor, NeighborIndex, ProjectorEmbeddings, SemanticEdgeWeights,
        SemanticGraphConfig, SemanticGraphError, USearchConfig, USearchIndex,
        audit::{MINIMUM_RECALL, audit_recall, stratified_audit_sample},
        build_semantic_graph,
        kernel::cosine_distance,
        publish_semantic_graph,
    },
    hash::ContentHash,
    identity::GenerationRowId,
    landmark::LandmarkCandidate,
    representation::PROJECTOR_DIMENSIONS,
};

#[test]
fn semantic_weights_reject_values_above_fuzzy_membership() {
    let table =
        KnnTable::new(2, 1, vec![1, 0], vec![0.25, 0.25]).expect("fixture graph should validate");

    assert!(SemanticEdgeWeights::new(&table, vec![1.0, 1.000_001]).is_err());
}

#[test]
fn audit_sampling_is_seeded_and_balanced_across_complete_strata() {
    let mut candidates = (0_u32..8)
        .map(|row| LandmarkCandidate {
            row: GenerationRowId::from_u32(row).expect("fixture row should fit"),
            sampling_weight: 1.0,
            density: 0,
            language: row / 4,
            source: 0,
            entity_role: 0,
            type_family: 0,
            community: 0,
            temporal_cohort: 0,
            prior_landmark: false,
        })
        .collect::<Vec<_>>();
    let maximum = NonZeroUsize::new(2).expect("fixture sample should be non-zero");
    let first = stratified_audit_sample(&candidates, candidates.len(), maximum, 41)
        .expect("complete strata should sample");
    candidates.reverse();
    let reordered = stratified_audit_sample(&candidates, candidates.len(), maximum, 41)
        .expect("candidate order should not affect sampling");

    assert_eq!(first, reordered);
    assert_eq!(first.iter().filter(|&&row| row < 4).count(), 1);
    assert_eq!(first.iter().filter(|&&row| row >= 4).count(), 1);
}

#[derive(Debug, Copy, Clone)]
struct ExactIndex<'embedding> {
    embeddings: ProjectorEmbeddings<'embedding>,
    reverse: bool,
}

impl NeighborIndex for ExactIndex<'_> {
    fn search(
        &self,
        query: &[f32; PROJECTOR_DIMENSIONS],
        limit: usize,
    ) -> Result<Vec<Neighbor>, SemanticGraphError> {
        let mut neighbors: Vec<_> = (0..self.embeddings.len())
            .map(|row| Neighbor {
                row: u32::try_from(row).expect("fixture row should fit u32"),
                distance: cosine_distance(query, self.embeddings.row(row)) as f32,
            })
            .collect();
        neighbors.sort_unstable_by(|left, right| {
            let order = left
                .distance
                .total_cmp(&right.distance)
                .then_with(|| left.row.cmp(&right.row));
            if self.reverse { order.reverse() } else { order }
        });
        neighbors.truncate(limit);
        Ok(neighbors)
    }

    fn identity(&self) -> ContentHash {
        ContentHash::digest(if self.reverse { b"reverse" } else { b"exact" })
    }
}

#[test]
fn projector_embeddings_enforce_the_normalized_prefix_bound() {
    let zero = vec![0.0_f32; PROJECTOR_DIMENSIONS];
    ProjectorEmbeddings::new(&zero).expect("zero-prefix rows should remain valid");

    let mut unit = vec![0.0_f32; PROJECTOR_DIMENSIONS];
    unit[0] = 1.0;
    ProjectorEmbeddings::new(&unit).expect("unit rows should validate");

    let oversized = vec![f32::MAX; PROJECTOR_DIMENSIONS];
    assert_matches!(
        ProjectorEmbeddings::new(&oversized),
        Err(SemanticGraphError::EmbeddingNorm { row: 0, .. })
    ));
}

#[test]
fn semantic_table_excludes_self_and_uses_stable_tie_order() {
    let values = fixture_embeddings(8);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let graph = build_semantic_graph(
        embeddings,
        &ExactIndex {
            embeddings,
            reverse: false,
        },
        SemanticGraphConfig {
            neighbors: NonZeroUsize::new(3).unwrap(),
        },
    )
    .expect("exact search should build a semantic table");

    for row in 0..graph.table.rows() {
        assert!(!graph.table.indices(row).contains(&(row as u32)));
        assert!(
            graph
                .table
                .distances(row)
                .windows(2)
                .all(|pair| pair[0] <= pair[1])
        );
    }
}

#[test]
fn exact_audit_accepts_exact_search_and_rejects_farthest_search() {
    let values = fixture_embeddings(64);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let sample: Vec<_> = (0_u32..12).collect();

    let exact = audit_recall(
        embeddings,
        &ExactIndex {
            embeddings,
            reverse: false,
        },
        &sample,
    )
    .expect("exact index should be auditable");
    assert_eq!(exact.recall, 1.0);
    exact
        .require_minimum()
        .expect("exact recall should pass the gate");

    let farthest = audit_recall(
        embeddings,
        &ExactIndex {
            embeddings,
            reverse: true,
        },
        &sample,
    )
    .expect("farthest index still returns structurally valid rows");
    assert!(farthest.recall < MINIMUM_RECALL);
    assert_matches!(
        farthest.require_minimum(),
        Err(SemanticGraphError::RecallBelowThreshold { .. })
    ));
}

#[test]
fn usearch_backend_passes_exact_recall_and_rebuilds_identically() {
    let values = fixture_embeddings(96);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let first_index =
        USearchIndex::build(embeddings, USearchConfig::default()).expect("USearch should build");
    let second_index =
        USearchIndex::build(embeddings, USearchConfig::default()).expect("USearch should rebuild");
    let sample: Vec<_> = (0_u32..16).collect();
    let config = SemanticGraphConfig {
        neighbors: NonZeroUsize::new(30).expect("neighbor count should be non-zero"),
    };

    let audit =
        audit_recall(embeddings, &first_index, &sample).expect("USearch should be auditable");
    let first = build_semantic_graph(embeddings, &first_index, config)
        .expect("first semantic graph should build");
    let second = build_semantic_graph(embeddings, &second_index, config)
        .expect("rebuilt semantic graph should build");

    assert!(
        audit.recall >= MINIMUM_RECALL,
        "fixture recall was {}",
        audit.recall
    );
    assert_eq!(first.table.all_indices(), second.table.all_indices());
    assert_eq!(first.table.all_distances(), second.table.all_distances());
}

#[test]
fn persisted_table_rejects_self_neighbors_and_unstable_ordering() {
    assert_matches!(
        KnnTable::new(3, 1, vec![0, 0, 0], vec![0.0; 3]),
        Err(SemanticGraphError::SelfNeighbor { row: 0 })
    ));
    assert_matches!(
        KnnTable::new(
            3,
            2,
            vec![1, 2, 0, 2, 0, 1],
            vec![0.4, 0.2, 0.1, 0.2, 0.1, 0.2],
        ),
        Err(SemanticGraphError::UnsortedNeighbors { row: 0, offset: 1 })
    ));
}

#[test]
fn audit_rejects_repeated_sample_rows() {
    let values = fixture_embeddings(4);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let index = ExactIndex {
        embeddings,
        reverse: false,
    };

    assert_matches!(
        audit_recall(embeddings, &index, &[1, 1]),
        Err(SemanticGraphError::DuplicateAuditRow { row: 1 })
    ));
}

#[test]
fn semantic_graph_artifact_binds_weights_and_backend_identity() {
    let values = fixture_embeddings(8);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let graph = build_semantic_graph(
        embeddings,
        &ExactIndex {
            embeddings,
            reverse: false,
        },
        SemanticGraphConfig {
            neighbors: NonZeroUsize::new(3).expect("neighbor count should be non-zero"),
        },
    )
    .expect("semantic graph should build");
    let weights = SemanticEdgeWeights::new(
        &graph.table,
        graph
            .table
            .all_distances()
            .iter()
            .map(|distance| 1.0 - distance / 2.0)
            .collect::<Vec<_>>(),
    )
    .expect("semantic weights should validate");
    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("semantic.salt"))
        .expect("temporary path should be UTF-8");

    let first =
        publish_semantic_graph(&path, &graph, &weights).expect("semantic graph should publish");
    let second = publish_semantic_graph(&path, &graph, &weights)
        .expect("semantic graph publication should be idempotent");

    assert!(!first.reused_existing);
    assert!(second.reused_existing);
    assert_eq!(first.content_hash, second.content_hash);
}

fn fixture_embeddings(rows: usize) -> Vec<f32> {
    let mut values = vec![0.0_f32; rows * PROJECTOR_DIMENSIONS];
    for row in 0..rows {
        let output = &mut values[row * PROJECTOR_DIMENSIONS..(row + 1) * PROJECTOR_DIMENSIONS];
        for (dimension, value) in output.iter_mut().enumerate() {
            let mixed = (row * 7_919 + dimension * 104_729 + 17) % 2_003;
            *value = mixed as f32 / 1_001.0 - 1.0;
        }
        let norm = output
            .iter()
            .map(|value| f64::from(*value).powi(2))
            .sum::<f64>()
            .sqrt() as f32;
        for value in output {
            *value /= norm;
        }
    }
    values
}
