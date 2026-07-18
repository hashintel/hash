use std::{collections::HashMap, io::Cursor};

use smallvec::smallvec;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::write_node_representations;
use crate::{
    dataset::{Node, PROJECTOR_DIMENSIONS, memory::MemoryDataset},
    file::array::{ArrayVariant, FileHeader},
    math::{BoxedVecN, VecN},
};

/// A unit vector with one hot component.
fn unit(component: usize) -> BoxedVecN<PROJECTOR_DIMENSIONS> {
    let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
    components[component] = 1.0;
    BoxedVecN::new(&VecN::new(components))
}

/// A dataset of embedding-only nodes.
fn nodes_only(embeddings: Vec<BoxedVecN<PROJECTOR_DIMENSIONS>>) -> MemoryDataset {
    let nodes = embeddings
        .into_iter()
        .enumerate()
        .map(|(row, embedding)| Node {
            id: U64::<LE>::new(row as u64),
            ontology: smallvec![],
            embedding,
            confidence: None,
        })
        .collect();

    MemoryDataset::new(nodes, vec![], vec![], HashMap::new(), HashMap::new())
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn representations_persist_row_aligned_with_the_node_stream() {
    let embeddings = vec![unit(0), unit(7), unit(511)];
    let dataset = nodes_only(embeddings.clone());

    let mut buffer = Cursor::new(Vec::new());
    let rows = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an in-memory dataset should persist");
    assert_eq!(rows, 3);

    let bytes = buffer.get_ref();
    let header = FileHeader::try_read_from_bytes(&bytes[..FileHeader::SIZE])
        .expect("a finished file should carry a valid header");
    assert_eq!(header.variant(), ArrayVariant::F32);
    let extents: Vec<u64> = header.shape().dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, PROJECTOR_DIMENSIONS as u64]);
    assert_eq!(header.expected_file_len(), Some(bytes.len() as u64));

    // Row `i` of the matrix is node row `i`'s embedding, bit for bit.
    let row_bytes = PROJECTOR_DIMENSIONS * size_of::<f32>();
    for (row, embedding) in embeddings.iter().enumerate() {
        let offset = FileHeader::SIZE + row * row_bytes;
        assert_eq!(
            &bytes[offset..offset + row_bytes],
            embedding.as_array().as_bytes(),
            "row {row} must hold its node's embedding",
        );
    }
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn an_empty_dataset_seals_an_empty_matrix() {
    let dataset = nodes_only(vec![]);

    let mut buffer = Cursor::new(Vec::new());
    let rows = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an empty dataset should persist");
    assert_eq!(rows, 0);

    let bytes = buffer.get_ref();
    assert_eq!(bytes.len(), FileHeader::SIZE);
    let header = FileHeader::try_read_from_bytes(bytes.as_slice())
        .expect("a finished file should carry a valid header");
    assert!(header.shape().dims().is_empty());
}
