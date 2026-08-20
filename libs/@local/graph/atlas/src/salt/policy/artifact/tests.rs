#![expect(
    clippy::little_endian_bytes,
    reason = "the tamper patches pin the format's canonical little-endian bytes"
)]
use core::assert_matches;
use std::{fs, path::PathBuf};

use super::{InvalidPolicyFile, PolicyTableArchive, write_policies};
use crate::{
    file::policy::read::PolicyFile,
    identity::OntologyRowId,
    math::{NonNegative, UnitFraction, unit_fraction},
    salt::policy::{CertifiedPolicies, ClassProbabilities, RelationPolicy},
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

fn policy(relation: u64, coincident: UnitFraction) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(relation),
        attraction: ClassProbabilities {
            coincident,
            proximal: unit_fraction!(0.25),
        },
        selected: ClassProbabilities {
            coincident,
            proximal: unit_fraction!(0.5),
        },
        applicability: unit_fraction!(0.75),
        strength: NonNegative::ONE,
        _pad: [0; 4],
    }
}

fn fixture() -> Vec<RelationPolicy> {
    vec![
        policy(2, unit_fraction!(0.0)),
        policy(5, unit_fraction!(0.5)),
        policy(9, unit_fraction!(1.0)),
    ]
}

fn fixture_bytes() -> Vec<u8> {
    let policies = CertifiedPolicies::new(fixture()).expect("the fixture is strictly ascending");
    let mut bytes = Vec::new();
    write_policies(&policies, &mut bytes).expect("writing into a vector cannot fail");
    bytes
}

/// Opens tampered fixture bytes as a mapped table.
fn reopen(name: &str, bytes: &[u8]) -> Result<PolicyTableArchive, InvalidPolicyFile> {
    let path = scratch(name);
    fs::write(&path, bytes).expect("the scratch file is writable");
    let file = PolicyFile::open(&path).expect("the tampered geometry still parses");
    PolicyTableArchive::new(file)
}

#[test]
fn round_trip_is_bit_exact() {
    let table = reopen("roundtrip.plcy", &fixture_bytes()).expect("the fixture is valid");

    assert_eq!(table.len(), 3);
    assert_eq!(table.policies(), fixture());
}

#[test]
fn find_resolves_by_relation() {
    let table = reopen("find.plcy", &fixture_bytes()).expect("the fixture is valid");

    assert_eq!(
        table.find(OntologyRowId::new(5)),
        Some(policy(5, unit_fraction!(0.5)))
    );
    assert_eq!(table.find(OntologyRowId::new(4)), None);
    assert_eq!(table.find(OntologyRowId::new(10)), None);
}

#[test]
fn empty_table_maps() {
    let policies =
        CertifiedPolicies::new(Vec::new()).expect("an empty table is trivially ascending");
    let mut bytes = Vec::new();
    write_policies(&policies, &mut bytes).expect("writing into a vector cannot fail");

    let table = reopen("empty.plcy", &bytes).expect("an empty table is valid");
    assert_eq!(table.len(), 0);
    assert_eq!(table.find(OntologyRowId::new(0)), None);
}

#[test]
fn rejects_unordered_and_duplicate_relations() {
    // Row 1's relation raised above row 2's.
    let offset = 4096 + 56;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&11_u64.to_le_bytes());
    assert_matches!(
        reopen("unordered.plcy", &bytes),
        Err(InvalidPolicyFile::UnorderedRelations { index: 2 }),
    );

    // Row 1's relation duplicated onto row 0's.
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&2_u64.to_le_bytes());
    assert_matches!(
        reopen("duplicate.plcy", &bytes),
        Err(InvalidPolicyFile::UnorderedRelations { index: 1 }),
    );
}

#[test]
fn rejects_out_of_domain_values() {
    // Row 1's attraction Coincident raised above one.
    let offset = 4096 + 56 + 8;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&1.5_f64.to_le_bytes());
    assert_matches!(
        reopen("probability.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 1 }),
    );

    // Row 1's attraction Proximal replaced with `-0.0`, numerically in range but not the
    // canonical bit pattern of a stored fraction. The bit-level check refuses it.
    let offset = 4096 + 56 + 16;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&(-0.0_f64).to_le_bytes());
    assert_matches!(
        reopen("negative-zero.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 1 }),
    );

    // Row 2's strength made negative.
    let offset = 4096 + 2 * 56 + 48;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 4].copy_from_slice(&(-1.0_f32).to_le_bytes());
    assert_matches!(
        reopen("strength.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 2 }),
    );

    // Row 0's applicability made NaN.
    let offset = 4096 + 40;
    let mut bytes = fixture_bytes();
    bytes[offset..offset + 8].copy_from_slice(&f64::NAN.to_le_bytes());
    assert_matches!(
        reopen("applicability.plcy", &bytes),
        Err(InvalidPolicyFile::Domain { index: 0 }),
    );
}

#[test]
fn certification_rejects_unordered_tables() {
    assert!(
        CertifiedPolicies::new(vec![
            policy(5, unit_fraction!(0.5)),
            policy(2, unit_fraction!(0.0)),
        ])
        .is_none()
    );
}
