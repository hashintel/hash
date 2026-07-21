#![expect(
    clippy::big_endian_bytes,
    reason = "big-endian id fixtures sort byte-wise like their numeric values"
)]
use core::assert_matches;
use std::{collections::HashMap, fs, io::Cursor, path::PathBuf};

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{
    identity::{IdentityTable, IdentityTableArchive, InvalidIdentityFile},
    instance::{InstanceRecord, InstanceSpoolWriter},
    norm::{self, RepresentationDefect, SpotCheckError, SpotCheckOptions},
    write_node_representations,
};
use crate::{
    dataset::{
        EdgeRowId, Node, NodeRowId, OntologyRowId, PROJECTOR_DIMENSIONS, memory::MemoryDataset,
    },
    file::{
        WriteInto as _,
        array::{ArrayVariant, FileHeader},
        generation::GenerationRoot,
        identity::read::IdentityFile,
    },
    math::{AlignedVecN, BoxedVecN, VecN},
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
    let columns = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an in-memory dataset should persist");
    assert_eq!(columns.ids.len(), 3);
    assert_eq!(columns.types.len(), 3);

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
    let columns = write_node_representations(&dataset, &mut buffer)
        .await
        .expect("an empty dataset should persist");
    assert_eq!(columns.ids.len(), 0);
    assert!(columns.types.is_empty());

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

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-prepare-identity-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

/// Writes a three-row fixture table and returns its file bytes.
///
/// Ids arrive out of byte order on purpose: little-endian bytes of values below 256 sort like the
/// values, so the sorted pair order is rows 1 (id 10), 2 (id 20), 0 (id 30).
fn fixture_table_bytes() -> Vec<u8> {
    let mut table = IdentityTable::new();
    for id in [30_u64, 10, 20] {
        table.push(U64::<LE>::new(id));
    }

    let mut bytes = Vec::new();
    table
        .write_into(&mut bytes)
        .expect("writing into a vector cannot fail");
    bytes
}

fn mapped_fixture(
    name: &str,
    bytes: &[u8],
) -> Result<IdentityTableArchive<U64<LE>>, InvalidIdentityFile> {
    let path = scratch(name);
    fs::write(&path, bytes).expect("the scratch file is writable");
    IdentityTableArchive::new(IdentityFile::open(&path).expect("the fixture file reopens"))
}

#[test]
fn identity_table_translates_rows_both_ways() {
    let table =
        mapped_fixture("roundtrip.idnt", &fixture_table_bytes()).expect("the table validates");

    assert_eq!(table.len(), 3);

    // Row to id is the push order.
    assert_eq!(table.id(0), Some(U64::new(30)));
    assert_eq!(table.id(1), Some(U64::new(10)));
    assert_eq!(table.id(2), Some(U64::new(20)));
    assert_eq!(table.id(3), None);

    // Id to row inverts it; absent ids resolve to nothing.
    assert_eq!(table.row_of(U64::new(30)), Some(0));
    assert_eq!(table.row_of(U64::new(10)), Some(1));
    assert_eq!(table.row_of(U64::new(20)), Some(2));
    assert_eq!(table.row_of(U64::new(15)), None);
    assert_eq!(table.row_of(U64::new(5)), None, "below every pair");
    assert_eq!(table.row_of(U64::new(40)), None, "above every pair");
}

#[test]
fn identity_lookup_crosses_stride_boundaries() {
    // 600 eight-byte ids stride at 256 pairs: three index keys, so
    // lookups exercise block selection, not just the first stride.
    // Big-endian bytes sort like the values themselves.
    let mut table = IdentityTable::new();
    for id in 0..600_u64 {
        table.push(id.to_be_bytes());
    }
    let mut bytes = Vec::new();
    table
        .write_into(&mut bytes)
        .expect("writing into a vector cannot fail");

    let path = scratch("strided.idnt");
    fs::write(&path, bytes).expect("the scratch file is writable");
    let mapped = IdentityTableArchive::<[u8; 8]>::new(
        IdentityFile::open(&path).expect("the fixture file reopens"),
    )
    .expect("the table validates");

    for row in [0_u64, 255, 256, 257, 511, 512, 599] {
        assert_eq!(mapped.row_of(row.to_be_bytes()), Some(row), "row {row}");
    }
    assert_eq!(mapped.row_of(600_u64.to_be_bytes()), None);
}

#[test]
#[should_panic(expected = "two rows carry one id")]
fn identity_table_rejects_duplicate_ids() {
    let mut table = IdentityTable::new();
    table.push(U64::<LE>::new(7));
    table.push(U64::<LE>::new(7));

    let mut bytes = Vec::new();
    let _result = table.write_into(&mut bytes);
}

// Region offsets of the three-row fixture: the 24-byte id column at
// 4096, one index key at 8192, and 16-byte pairs from 12288 - each
// region padded to the next 4096-byte boundary.
const IDS_OFFSET: usize = 4096;
const INDEX_OFFSET: usize = 8192;
const PAIRS_OFFSET: usize = 12288;

#[test]
fn validation_rejects_tampered_tables() {
    // Duplicating a pair over its successor breaks the strictly
    // ascending order.
    let mut unsorted = fixture_table_bytes();
    unsorted.copy_within(PAIRS_OFFSET..PAIRS_OFFSET + 16, PAIRS_OFFSET + 16);
    assert_matches!(
        mapped_fixture("unsorted.idnt", &unsorted),
        Err(InvalidIdentityFile::UnsortedPairs { position: 1 }),
    );

    // A pair pointing past the domain names no row.
    let mut out_of_domain = fixture_table_bytes();
    out_of_domain[PAIRS_OFFSET + 8] = 9;
    assert_matches!(
        mapped_fixture("out-of-domain.idnt", &out_of_domain),
        Err(InvalidIdentityFile::RowOutOfDomain {
            position: 0,
            row: 9,
        }),
    );

    // A tampered id column disagrees with the pair that references it.
    let mut disagreeing = fixture_table_bytes();
    disagreeing[IDS_OFFSET] = 31;
    assert_matches!(
        mapped_fixture("disagreeing.idnt", &disagreeing),
        Err(InvalidIdentityFile::ColumnDisagreement { row: 0 }),
    );

    // A tampered index key disagrees with the first pair of its stride.
    let mut index_tampered = fixture_table_bytes();
    index_tampered[INDEX_OFFSET] = 11;
    assert_matches!(
        mapped_fixture("index-tampered.idnt", &index_tampered),
        Err(InvalidIdentityFile::IndexDisagreement { key: 0 }),
    );

    // The id type's width is part of the contract.
    let path = scratch("narrow.idnt");
    fs::write(&path, fixture_table_bytes()).expect("the scratch file is writable");
    assert_matches!(
        IdentityTableArchive::<[u8; 4]>::new(
            IdentityFile::open(&path).expect("the fixture file reopens"),
        ),
        Err(InvalidIdentityFile::KeyWidth {
            expected: 4,
            actual: 8,
        }),
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
            link: Some(0.5),
            source: None,
            target: None,
        },
        RelationConfidence {
            link: None,
            source: Some(0.25),
            target: Some(1.0),
        },
        RelationConfidence {
            link: None,
            source: None,
            target: None,
        },
        RelationConfidence {
            link: Some(1.0),
            source: Some(0.0),
            target: Some(0.75),
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

        assert_eq!(instance.edge.get(), 7 + index as u64);
        assert_eq!(instance.relation.get(), 3);
        assert_eq!(instance.source.get(), 1);
        assert_eq!(instance.target.get(), 2);
        assert_eq!(instance.confidence, confidence, "case {index}");
        assert_eq!(instance.multiplicity, 3, "case {index}");
    }
}

#[test]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the scratch directory must outlive the spool mapped from it"
)]
fn the_spool_round_trips_through_its_scratch_file() {
    let root = GenerationRoot::new(spool_root("round-trip")).expect("the root should open");
    let scratch = root.scratch().expect("the scratch directory should create");

    let records = [
        InstanceRecord::new(
            EdgeRowId::new(0),
            OntologyRowId::new(2),
            NodeRowId::new(0),
            NodeRowId::new(1),
            RelationConfidence {
                link: Some(0.5),
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
fn an_empty_spool_maps_to_zero_readings() {
    let root = GenerationRoot::new(spool_root("empty")).expect("the root should open");
    let scratch = root.scratch().expect("the scratch directory should create");

    let writer = InstanceSpoolWriter::create(&scratch).expect("the spool should create");
    let spool = writer.finish().expect("the spool should seal");
    assert_eq!(spool.count(), 0);

    let mapped = spool.map().expect("the empty spool should map");
    assert!(mapped.records().is_empty());
}
