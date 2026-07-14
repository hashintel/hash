use core::num::NonZeroUsize;

use crate::salt::{
    graph::{
        KnnTable, Neighbor, NeighborIndex, ProjectorEmbeddings, SemanticGraphConfig,
        SemanticGraphError, USearchConfig, USearchIndex,
        audit::{MINIMUM_RECALL, audit_recall},
        build_semantic_graph,
        kernel::cosine_distance,
    },
    hash::ContentHash,
    representation::PROJECTOR_DIMENSIONS,
};

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
    assert!(matches!(
        farthest.require_minimum(),
        Err(SemanticGraphError::RecallBelowThreshold { .. })
    ));
}

#[test]
fn usearch_backend_passes_exact_recall_on_a_deterministic_fixture() {
    let values = fixture_embeddings(96);
    let embeddings = ProjectorEmbeddings::new(&values).expect("fixture matrix should validate");
    let index =
        USearchIndex::build(embeddings, USearchConfig::default()).expect("USearch should build");
    let sample: Vec<_> = (0_u32..16).collect();

    let audit = audit_recall(embeddings, &index, &sample).expect("USearch should be auditable");

    assert!(
        audit.recall >= MINIMUM_RECALL,
        "fixture recall was {}",
        audit.recall
    );
}

#[test]
fn persisted_table_rejects_self_neighbors_and_unstable_ordering() {
    assert!(matches!(
        KnnTable::new(3, 1, vec![0, 0, 0], vec![0.0; 3]),
        Err(SemanticGraphError::SelfNeighbor { row: 0 })
    ));
    assert!(matches!(
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

    assert!(matches!(
        audit_recall(embeddings, &index, &[1, 1]),
        Err(SemanticGraphError::DuplicateAuditRow { row: 1 })
    ));
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
