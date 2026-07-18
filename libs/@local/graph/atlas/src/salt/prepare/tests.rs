use std::{collections::HashMap, io::Cursor};

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{
    norm::{self, RepresentationDefect, SpotCheckError, SpotCheckOptions},
    write_node_representations,
};
use crate::{
    dataset::{Node, NodeRowId, PROJECTOR_DIMENSIONS, memory::MemoryDataset},
    file::array::{ArrayVariant, FileHeader},
    math::{AlignedVecN, BoxedVecN, VecN},
};

/// Norm-fixture capacity in components: the largest test matrix.
const MATRIX_CAPACITY: usize = 700 * PROJECTOR_DIMENSIONS;

/// Fixture rows in SIMD-aligned row-major storage, the shape a mapped
/// `f32[N, 512]` artifact yields.
struct Matrix {
    storage: BoxedVecN<MATRIX_CAPACITY>,
    rows: usize,
}

impl Matrix {
    /// One-hot unit rows, component zero hot.
    fn units(rows: usize) -> Self {
        let mut storage = BoxedVecN::zero();
        for row in 0..rows {
            storage.as_array_mut()[row * PROJECTOR_DIMENSIONS] = 1.0;
        }
        Self { storage, rows }
    }

    fn row_mut(&mut self, row: usize) -> &mut [f32] {
        &mut self.storage.as_array_mut()[row * PROJECTOR_DIMENSIONS..][..PROJECTOR_DIMENSIONS]
    }

    fn view(&self) -> &[AlignedVecN<PROJECTOR_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows * PROJECTOR_DIMENSIONS])
            .expect("boxed storage is aligned")
    }
}

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

#[test]
#[expect(
    clippy::float_cmp,
    reason = "options round-trip into the evidence verbatim; bit equality is the contract"
)]
fn spot_check_certifies_a_normalized_matrix() {
    let matrix = Matrix::units(5);
    let check = norm::spot_check(
        matrix.view(),
        SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");

    // Five rows sit far below the sample size, so the check is
    // exhaustive and the certification exact.
    assert_eq!(check.rows, 5);
    assert_eq!(check.sampled_rows, 5);
    assert!(check.passes());
    assert_eq!(check.defects, vec![]);
    assert_eq!(check.tolerance, 1e-4);
    assert_eq!(check.defect_rate, 0.01);
    assert_eq!(check.confidence, 0.999);
}

#[test]
fn spot_check_lists_every_defective_sampled_row() {
    let mut matrix = Matrix::units(6);
    matrix.row_mut(1)[3] = f32::NAN;
    matrix.row_mut(4)[4] = 2.0; // joins the hot component: squared norm 1 + 4, exactly

    let check = norm::spot_check(
        matrix.view(),
        SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");

    assert!(!check.passes());
    assert_eq!(
        check.defects,
        vec![
            RepresentationDefect::NonFinite {
                row: NodeRowId::new(1),
                component: 3,
            },
            RepresentationDefect::Norm {
                row: NodeRowId::new(4),
                squared_norm: 5.0,
            },
        ],
    );
}

#[test]
fn spot_check_honours_a_configured_tolerance() {
    let mut matrix = Matrix::units(4);
    // Replaces the hot component: squared norm ~1 + 4e-5, inside the
    // default tolerance and outside a hundredfold tighter one.
    matrix.row_mut(2)[0] = 1.00002;

    let default = norm::spot_check(
        matrix.view(),
        SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");
    assert!(default.passes());

    let tight = norm::spot_check(
        matrix.view(),
        SpotCheckOptions {
            tolerance: 1e-6,
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");
    assert!(!tight.passes());
    assert!(matches!(
        tight.defects.as_slice(),
        [RepresentationDefect::Norm { .. }],
    ));
}

#[test]
#[cfg_attr(miri, ignore = "a 700-row kernel sweep is too slow interpreted")]
fn spot_check_samples_large_matrices() {
    let matrix = Matrix::units(700);
    let check = norm::spot_check(
        matrix.view(),
        SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");

    // The default budget asks for 688 of the 700 rows.
    assert_eq!(check.rows, 700);
    assert_eq!(check.sampled_rows, 688);
    assert!(check.passes());
}

#[test]
fn spot_check_rejects_degenerate_inputs() {
    assert_eq!(
        norm::spot_check(
            &[],
            SpotCheckOptions { .. },
            Xoshiro256PlusPlus::seed_from_u64(42),
        ),
        Err(SpotCheckError::Empty),
    );

    let matrix = Matrix::units(2);
    assert_eq!(
        norm::spot_check(
            matrix.view(),
            SpotCheckOptions {
                defect_rate: 0.0,
                ..
            },
            Xoshiro256PlusPlus::seed_from_u64(42),
        ),
        Err(SpotCheckError::SampleBudget {
            defect_rate: 0.0,
            confidence: 0.999,
        }),
    );
}
