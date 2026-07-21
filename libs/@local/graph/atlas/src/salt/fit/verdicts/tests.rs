use core::assert_matches;
use std::fs;

use camino::Utf8PathBuf;

use super::{SuppliedVerdicts, SupplyError};
use crate::{
    integrity::{Sha256, Update as _},
    salt::projector::verdict::{InvalidReviewedVerdicts, PlacementClass},
};

/// A document in the canonical exporter's shape.
///
/// Alphabetical keys, one type verdict with a store identity.
const DOCUMENT: &str = r#"{"pair_verdicts":[],"schema":"atlas-reviewed-verdicts/1","sources":{"cards.jsonl":"2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b"},"type_verdicts":[{"class":"proximal","relation":"hash:https://hash.ai/@h/types/entity-type/delivers/","reviewer":"Bilal Mahmoud","versioned_url":"https://hash.ai/@h/types/entity-type/delivers/v/3"}]}
"#;

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-verdicts-{}-{name}",
            std::process::id(),
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

#[test]
fn construction_preserves_bytes_and_binds_their_digest() {
    let supplied = SuppliedVerdicts::from_bytes(DOCUMENT.as_bytes())
        .expect("a contract-conforming document admits");

    // The staged artifact is the supplied file verbatim: the bytes
    // survive untransformed, trailing newline included.
    assert_eq!(supplied.bytes(), DOCUMENT.as_bytes());

    // The identity is the digest of the wire bytes, not of any parsed
    // or re-encoded form.
    let mut hasher = Sha256::new();
    hasher.update(DOCUMENT.as_bytes());
    assert_eq!(supplied.hash(), hasher.finalize());
}

#[test]
fn construction_exposes_the_validated_document() {
    let supplied = SuppliedVerdicts::from_bytes(DOCUMENT.as_bytes())
        .expect("a contract-conforming document admits");

    let types = supplied.document().type_verdicts();
    assert_eq!(types.len(), 1);
    assert_eq!(types[0].placement, PlacementClass::Proximal);
    assert!(supplied.document().pair_verdicts().is_empty());
}

#[test]
fn a_contract_violation_is_rejected_at_supply() {
    let foreign_schema = DOCUMENT.replace("atlas-reviewed-verdicts/1", "atlas-reviewed-verdicts/2");

    assert_matches!(
        SuppliedVerdicts::from_bytes(foreign_schema.into_bytes()),
        Err(InvalidReviewedVerdicts::Schema { found }) if &*found == "atlas-reviewed-verdicts/2",
    );
}

#[test]
fn open_reads_the_file_and_reports_both_failure_shapes() {
    let dir = scratch("open");
    let path = dir.join("reviewed-verdicts.json");
    fs::write(&path, DOCUMENT).expect("the fixture file should write");

    let supplied = SuppliedVerdicts::open(&path).expect("the written document admits");
    assert_eq!(supplied.bytes(), DOCUMENT.as_bytes());

    assert_matches!(
        SuppliedVerdicts::open(dir.join("absent.json")),
        Err(SupplyError::Io(_)),
    );

    fs::write(&path, "not json").expect("the fixture file should overwrite");
    assert_matches!(
        SuppliedVerdicts::open(&path),
        Err(SupplyError::Invalid(InvalidReviewedVerdicts::Json(_))),
    );
}
