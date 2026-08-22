use alloc::borrow::Cow;
use core::assert_matches;
use std::{collections::HashMap, fs, io::Cursor};

use hashql_core::id::Id as _;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{
    instance::{InstanceRecord, InstanceSpoolWriter},
    norm::{self, RepresentationDefect, SpotCheckError, SpotCheckOptions},
    write_node_representations,
};
use crate::{
    dataset::{Node, PROJECTOR_DIMENSIONS, memory::MemoryDataset},
    file::{
        array::{ArrayVariant, PaddedFileHeader},
        generation::GenerationRoot,
        region::PAGE_BYTES,
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{AlignedVecN, BoxedVecN, VecN, d_positive, open_unit_fraction, unit_fraction},
    salt::relation::RelationConfidence,
};

/// Norm-fixture capacity in components: the largest test matrix.
const MATRIX_CAPACITY: usize = 700 * PROJECTOR_DIMENSIONS;

/// Fixture rows in SIMD-aligned row-major storage.
///
/// The shape a mapped `f32[N, 512]` artifact yields.
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
            embedding: Cow::Owned(embedding),
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
    let columns = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an in-memory dataset should persist");
    assert_eq!(columns.ids.len(), 3);
    assert_eq!(columns.types.len(), 3);

    let bytes = buffer.get_ref();
    let header = PaddedFileHeader::try_ref_from_bytes(&bytes[..PAGE_BYTES])
        .expect("a finished file should carry a valid header");
    assert_eq!(header.variant(), ArrayVariant::F32);
    let extents: Vec<u64> = header.shape().dims().iter().map(|dim| dim.get()).collect();
    assert_eq!(extents, [3, PROJECTOR_DIMENSIONS as u64]);
    assert_eq!(header.expected_file_len(), Some(bytes.len() as u64));

    // Row `i` of the matrix is node row `i`'s embedding, bit for bit.
    let row_bytes = PROJECTOR_DIMENSIONS * size_of::<f32>();
    for (row, embedding) in embeddings.iter().enumerate() {
        let offset = PAGE_BYTES + row * row_bytes;
        assert_eq!(
            &bytes[offset..offset + row_bytes],
            embedding.as_bytes(),
            "row {row} must hold its node's embedding",
        );
    }
}

#[tokio::test]
#[cfg_attr(
    miri,
    ignore = "tokio's I/O driver calls foreign functions Miri cannot emulate"
)]
async fn empty_dataset_seals_an_empty_matrix() {
    let dataset = nodes_only(vec![]);

    let mut buffer = Cursor::new(Vec::new());
    let columns = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an empty dataset should persist");
    assert_eq!(columns.ids.len(), 0);
    assert!(columns.types.is_empty());

    let bytes = buffer.get_ref();
    assert_eq!(bytes.len(), PAGE_BYTES);
    let header = PaddedFileHeader::try_ref_from_bytes(bytes.as_slice())
        .expect("a finished file should carry a valid header");
    assert!(header.shape().dims().is_empty());
}

#[test]
fn spot_check_certifies_a_normalized_matrix() {
    let matrix = Matrix::units(5);
    let check = norm::spot_check(
        matrix.view(),
        SpotCheckOptions { .. },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");

    // The corpus sits far below the sample size, so the check is exhaustive and the certification
    // exact.
    assert_eq!(check.rows, 5);
    assert_eq!(check.sampled_rows, 5);
    assert!(check.passes());
    assert_eq!(check.defects, vec![]);
    assert_eq!(check.tolerance, d_positive!(1e-4));
    assert_eq!(check.defect_rate, open_unit_fraction!(0.01));
    assert_eq!(check.confidence, open_unit_fraction!(0.999));
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
            tolerance: d_positive!(1e-6),
            ..
        },
        Xoshiro256PlusPlus::seed_from_u64(42),
    )
    .expect("a non-empty matrix under a sound budget checks");
    assert!(!tight.passes());
    assert_matches!(
        tight.defects.as_slice(),
        [RepresentationDefect::Norm { .. }],
    );
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
fn spot_check_rejects_an_empty_matrix() {
    assert_eq!(
        norm::spot_check(
            &[],
            SpotCheckOptions { .. },
            Xoshiro256PlusPlus::seed_from_u64(42),
        ),
        Err(SpotCheckError::Empty),
    );
}

/// An instance spool root under the system temp directory.
fn spool_root(name: &str) -> camino::Utf8PathBuf {
    let dir = camino::Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-prepare-spool-{}-{name}",
            std::process::id(),
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    dir
}

#[test]
fn instance_records_round_trip_their_option_confidences() {
    // Every presence combination of the three scores survives the
    // encode/decode pair, absent scores included.
    let confidences = [
        RelationConfidence {
            link: Some(unit_fraction!(0.5)),
            source: None,
            target: None,
        },
        RelationConfidence {
            link: None,
            source: Some(unit_fraction!(0.25)),
            target: Some(unit_fraction!(1.0)),
        },
        RelationConfidence {
            link: None,
            source: None,
            target: None,
        },
        RelationConfidence {
            link: Some(unit_fraction!(1.0)),
            source: Some(unit_fraction!(0.0)),
            target: Some(unit_fraction!(0.75)),
        },
    ];

    for (index, confidence) in confidences.into_iter().enumerate() {
        let record = InstanceRecord::new(
            EdgeRowId::new(7 + index as u64),
            OntologyRowId::new(3),
            NodeRowId::new(1),
            NodeRowId::new(2),
            confidence,
            3,
        );
        let instance = record.instance();

        assert_eq!(instance.edge.as_u64(), 7 + index as u64);
        assert_eq!(instance.relation.as_u64(), 3);
        assert_eq!(instance.source.as_u64(), 1);
        assert_eq!(instance.target.as_u64(), 2);
        assert_eq!(instance.confidence, confidence, "case {index}");
        assert_eq!(instance.multiplicity, 3, "case {index}");
    }
}

#[test]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the scratch directory must outlive the spool mapped from it"
)]
fn spool_round_trips_through_its_scratch_file() {
    let root = GenerationRoot::new(spool_root("round-trip")).expect("the root should open");
    let scratch = root.scratch().expect("the scratch directory should create");

    let records = [
        InstanceRecord::new(
            EdgeRowId::new(0),
            OntologyRowId::new(2),
            NodeRowId::new(0),
            NodeRowId::new(1),
            RelationConfidence {
                link: Some(unit_fraction!(0.5)),
                source: None,
                target: None,
            },
            2,
        ),
        InstanceRecord::new(
            EdgeRowId::new(1),
            OntologyRowId::new(3),
            NodeRowId::new(2),
            NodeRowId::new(2),
            RelationConfidence::default(),
            1,
        ),
    ];

    let mut writer = InstanceSpoolWriter::create(&scratch).expect("the spool should create");
    for record in records {
        writer
            .push(record)
            .expect("the spool should accept a record");
    }
    let spool = writer.finish().expect("the spool should seal");
    assert_eq!(spool.count(), 2);

    let mapped = spool.map().expect("the spool should map");
    let read_back: Vec<_> = mapped
        .records()
        .iter()
        .map(InstanceRecord::instance)
        .collect();
    let expected: Vec<_> = records.iter().map(InstanceRecord::instance).collect();
    assert_eq!(read_back, expected);
}

#[test]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the scratch directory must outlive the spool mapped from it"
)]
fn empty_spool_maps_to_zero_readings() {
    let root = GenerationRoot::new(spool_root("empty")).expect("the root should open");
    let scratch = root.scratch().expect("the scratch directory should create");

    let writer = InstanceSpoolWriter::create(&scratch).expect("the spool should create");
    let spool = writer.finish().expect("the spool should seal");
    assert_eq!(spool.count(), 0);

    let mapped = spool.map().expect("the empty spool should map");
    assert!(mapped.records().is_empty());
}

#[test]
#[expect(
    clippy::little_endian_bytes,
    reason = "the test plants an out-of-domain value in the record's little-endian lane"
)]
fn spool_record_parse_refuses_an_out_of_domain_confidence() {
    let record = InstanceRecord::new(
        EdgeRowId::new(0),
        OntologyRowId::new(1),
        NodeRowId::new(0),
        NodeRowId::new(1),
        RelationConfidence::default(),
        1,
    );
    assert_matches!(
        InstanceRecord::try_read_from_bytes(record.as_bytes()),
        Ok(_)
    );

    // The link confidence sits behind the record's row ids: `repr(C)` places it after the
    // edge, relation, source, and target columns, one u64 lane each.
    let link_offset = 4 * size_of::<u64>();
    let mut bytes = record.as_bytes().to_vec();
    bytes[link_offset..link_offset + size_of::<f64>()].copy_from_slice(&2.0_f64.to_le_bytes());

    assert_matches!(InstanceRecord::try_read_from_bytes(&bytes), Err(_));
}
