#![expect(
    clippy::little_endian_bytes,
    reason = "the tamper patches pin the format's canonical little-endian bytes"
)]

use std::{fs, path::PathBuf};

use super::{InvalidPolicyFile, MappedPolicyTable, write_policies};
use crate::{
    dataset::OntologyRowId,
    file::policy::read::PolicyFile,
    salt::policy::{ClassProbabilities, RelationPolicy},
};

/// A per-test scratch file path under the system temp directory.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "hash-graph-atlas-policy-artifact-{}",
        std::process::id(),
    ));
    fs::create_dir_all(&dir).expect("the temp directory is writable");
    dir.join(name)
}

fn policy(relation: u64, coincident: f32) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(relation),
        attraction: ClassProbabilities {
            coincident,
            proximal: 0.25,
        },
        selected: ClassProbabilities {
            coincident,
            proximal: 0.5,
        },
        applicability: 0.75,
        strength: 1.0,
    }
}

fn fixture() -> Vec<RelationPolicy> {
    vec![policy(2, 0.0), policy(5, 0.5), policy(9, 1.0)]
}

fn fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    write_policies(&fixture(), &mut bytes).expect("writing into a vector cannot fail");
    bytes
}

/// Opens tampered fixture bytes as a mapped table.
fn reopen(name: &str, bytes: &[u8]) -> Result<MappedPolicyTable, InvalidPolicyFile> {
    let path = scratch(name);
    fs::write(&path, bytes).expect("the scratch file is writable");
    let file = PolicyFile::open(&path).expect("the tampered geometry still parses");
    MappedPolicyTable::new(file)
}

#[test]
fn round_trip_is_bit_exact() {
    let table = reopen("roundtrip.plcy", &fixture_bytes()).expect("the fixture is valid");

    assert_eq!(table.len(), 3);
    assert_eq!(table.policies().collect::<Vec<_>>(), fixture());
}

#[test]
fn find_resolves_by_relation() {
    let table = reopen("find.plcy", &fixture_bytes()).expect("the fixture is valid");

    assert_eq!(table.find(OntologyRowId::new(5)), Some(policy(5, 0.5)));
    assert_eq!(table.find(OntologyRowId::new(4)), None);
    assert_eq!(table.find(OntologyRowId::new(10)), None);
}

#[test]
fn empty_table_maps() {
    let mut bytes = Vec::new();
    write_policies(&[], &mut bytes).expect("writing into a vector cannot fail");

    let table = reopen("empty.plcy", &bytes).expect("an empty table is valid");
    assert_eq!(table.len(), 0);
    assert_eq!(table.find(OntologyRowId::new(0)), None);
}

#[test]
fn rejects_unordered_and_duplicate_relations() {
    // Row 1's relation raised above row 2's.
    let offset = 4096 + 32;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&11_u64.to_le_bytes());
    assert!(matches!(
        reopen("unordered.plcy", &bytes),
        Err(InvalidPolicyFile::UnorderedRelations { index: 2 }),
    ));

    // Row 1's relation duplicated onto row 0's.
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&2_u64.to_le_bytes());
    assert!(matches!(
        reopen("duplicate.plcy", &bytes),
        Err(InvalidPolicyFile::UnorderedRelations { index: 1 }),
    ));
}

#[test]
fn rejects_out_of_domain_values() {
    // Row 1's attraction Coincident raised above one.
    let offset = 4096 + 32 + 8;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 4].copy_from_slice(&1.5_f32.to_le_bytes());
    assert!(matches!(
        reopen("probability.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 1 }),
    ));

    // Row 2's strength made negative.
    let offset = 4096 + 2 * 32 + 28;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 4].copy_from_slice(&(-1.0_f32).to_le_bytes());
    assert!(matches!(
        reopen("strength.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 2 }),
    ));

    // Row 0's applicability made NaN.
    let offset = 4096 + 24;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 4].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(matches!(
        reopen("applicability.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 0 }),
    ));
}

#[test]
#[should_panic(expected = "the resolved table is strictly ascending by relation")]
fn writer_rejects_unordered_input() {
    let mut bytes = Vec::new();
    let _result = write_policies(&[policy(5, 0.5), policy(2, 0.0)], &mut bytes);
}
