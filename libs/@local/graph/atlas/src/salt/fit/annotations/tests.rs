use core::assert_matches;
use std::fs;

use camino::Utf8PathBuf;
use serde_json::json;

use super::{SuppliedAnnotations, SupplyError};
use crate::{
    integrity::{Sha256, Update as _},
    salt::policy::annotation::InvalidAnnotationCorpus,
};

const DIGEST: &str = "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b";
const EMPLOYED_BY: &str = "https://hash.ai/@h/types/entity-type/employed-by/v/1";

/// Composes a minimal contract-conforming document: one hash card
/// carrying one geometry vote.
fn document() -> String {
    json!({
        "cards": [{
            "axes": {
                "base_url": "https://hash.ai/@h/types/entity-type/employed-by/",
                "family": "f-0007",
                "inverse_of": [],
                "publisher": "hash.ai/@h",
            },
            "content": {
                "aliases": [],
                "ancestors": [],
                "constraints": {
                    "direction": "source -> target",
                    "distinct_values": null,
                    "single_value": null,
                    "symmetric": null,
                    "transitive": null,
                },
                "description": "The subject is employed by the object.",
                "endpoint_constraints": [],
                "examples": [],
                "inverse": null,
                "language": "en",
                "slug": "employed-by",
                "source_types": [{"description": null, "label": "Person"}],
                "target_types": [{"description": null, "label": "Organization"}],
                "title": "Employed By",
            },
            "flags": {"holdout": null, "prescreen_stratum": null, "shot_excluded": false},
            "identity": EMPLOYED_BY,
            "retrieved_at": null,
            "source": "hash",
            "source_record_hash": null,
            "votes": [{
                "card_hash": DIGEST,
                "effort": "high",
                "framing": "S1xF1",
                "model_pinned": "gpt-5.2",
                "model_returned": "gpt-5.2-2026-05-01",
                "prompt_pack_hash": DIGEST,
                "provider": "amazon-bedrock",
                "quantization": null,
                "repeat_index": 0,
                "rubric_version": "v2",
                "seed": 7,
                "temperature": 0.2,
                "verdict": "proximal",
            }],
        }],
        "schema": "atlas-annotation-corpus/1",
        "sources": {"cards.jsonl": DIGEST},
    })
    .to_string()
}

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-annotations-{}-{name}",
            std::process::id(),
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("the scratch directory should create");
    dir
}

#[test]
fn construction_preserves_bytes_and_binds_their_digest() {
    let document = document();
    let supplied = SuppliedAnnotations::from_bytes(document.as_bytes())
        .expect("a contract-conforming document admits");

    // The staged artifact is the supplied file verbatim: the bytes
    // survive untransformed.
    assert_eq!(supplied.bytes(), document.as_bytes());

    // The identity is the digest of the wire bytes, not of any parsed
    // or re-encoded form.
    let mut hasher = Sha256::new();
    hasher.update(document.as_bytes());
    assert_eq!(supplied.hash(), hasher.finalize());

    assert_eq!(supplied.document().cards().len(), 1);
}

#[test]
fn a_contract_violation_is_rejected_at_supply() {
    let foreign_schema =
        document().replace("atlas-annotation-corpus/1", "atlas-annotation-corpus/2");

    assert_matches!(
        SuppliedAnnotations::from_bytes(foreign_schema.into_bytes()),
        Err(InvalidAnnotationCorpus::Schema { found }) if &*found == "atlas-annotation-corpus/2",
    );
}

#[test]
fn open_reads_the_file_and_reports_both_failure_shapes() {
    let dir = scratch("open");
    let path = dir.join("annotation-corpus.json");
    let document = document();
    fs::write(&path, &document).expect("the fixture file should write");

    let supplied = SuppliedAnnotations::open(&path).expect("the written document admits");
    assert_eq!(supplied.bytes(), document.as_bytes());

    assert_matches!(
        SuppliedAnnotations::open(dir.join("absent.json")),
        Err(SupplyError::Io(_)),
    );

    fs::write(&path, "not json").expect("the fixture file should overwrite");
    assert_matches!(
        SuppliedAnnotations::open(&path),
        Err(SupplyError::Invalid(InvalidAnnotationCorpus::Json(_))),
    );
}
