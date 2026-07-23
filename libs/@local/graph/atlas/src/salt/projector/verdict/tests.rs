use core::assert_matches;

use uuid::Uuid;

use super::{InvalidReviewedVerdicts, PlacementClass, ReviewedVerdicts};
use crate::dataset::ArchivedOntologyTypeUuid;

/// Composes a wire document with the canonical exporter's key order.
fn document(type_verdicts: &str, pair_verdicts: &str) -> String {
    format!(
        r#"{{"pair_verdicts":[{pair_verdicts}],"schema":"atlas-reviewed-verdicts/1","sources":{{"cards.jsonl":"2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b"}},"type_verdicts":[{type_verdicts}]}}"#
    )
}

/// Composes one type verdict whose relation is the `hash`-namespace form of its base URL.
///
/// As the exporter emits it.
fn verdict(class: &str, base: &str, version: u32) -> String {
    format!(
        r#"{{"class":"{class}","relation":"hash:{base}","reviewer":"Bilal Mahmoud","versioned_url":"{base}v/{version}"}}"#
    )
}

/// Derives a type-table entry through the raw `UUIDv5` constructor.
///
/// Independently of the resolver's `OntologyTypeUuid::from_url` path.
fn table_entry(base: &str, version: u32) -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::from(Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("{base}v/{version}").as_bytes(),
    ))
}

const DELIVERS: &str = "https://hash.ai/@h/types/entity-type/delivers/";
const LINK: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/";
const YIELDS: &str = "https://hash.ai/@h/types/entity-type/yields/";

#[test]
fn shipped_shape_parses() {
    let json = document(
        &[
            verdict("overlay", LINK, 1),
            verdict("proximal", DELIVERS, 3),
            verdict("coincident", YIELDS, 2),
        ]
        .join(","),
        "",
    );

    let verdicts = ReviewedVerdicts::from_slice(json.as_bytes())
        .expect("a contract-conforming document parses");

    let types = verdicts.type_verdicts();
    assert_eq!(types.len(), 3);
    assert_eq!(types[0].placement, PlacementClass::Overlay);
    assert_eq!(types[0].relation, format!("hash:{LINK}"));
    assert_eq!(types[0].reviewer, "Bilal Mahmoud");
    assert_eq!(
        types[0]
            .versioned_url
            .as_ref()
            .expect("the fixture records a store identity")
            .to_string(),
        format!("{LINK}v/1"),
    );
    assert_eq!(types[1].placement, PlacementClass::Proximal);
    assert_eq!(types[2].placement, PlacementClass::Coincident);

    assert!(verdicts.pair_verdicts().is_empty());
    assert_eq!(
        verdicts
            .sources()
            .get("cards.jsonl")
            .expect("the fixture records one source")
            .to_string(),
        "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b",
    );
}

#[test]
fn foreign_schema_is_rejected() {
    let json = document(&verdict("overlay", LINK, 1), "")
        .replace("atlas-reviewed-verdicts/1", "atlas-reviewed-verdicts/2");

    assert_matches!(
        ReviewedVerdicts::from_slice(json.as_bytes()),
        Err(InvalidReviewedVerdicts::Schema { found }) if &*found == "atlas-reviewed-verdicts/2",
    );
}

#[test]
fn unknown_fields_and_classes_are_rejected() {
    // A field this reader does not know is a schema evolution it has
    // not been told about, at the document and the row level alike.
    let extra_document =
        document(&verdict("overlay", LINK, 1), "").replacen('{', r#"{"extra":1,"#, 1);
    assert_matches!(
        ReviewedVerdicts::from_slice(extra_document.as_bytes()),
        Err(InvalidReviewedVerdicts::Json(_)),
    );

    let extra_row = document(
        &verdict("overlay", LINK, 1).replacen('{', r#"{"extra":1,"#, 1),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(extra_row.as_bytes()),
        Err(InvalidReviewedVerdicts::Json(_)),
    );

    // `excluded` reviews are omitted by the exporter, never a class.
    let excluded = document(&verdict("excluded", LINK, 1), "");
    assert_matches!(
        ReviewedVerdicts::from_slice(excluded.as_bytes()),
        Err(InvalidReviewedVerdicts::Json(_)),
    );
}

#[test]
fn malformed_versioned_urls_and_digests_are_rejected() {
    let unversioned = document(
        &verdict("overlay", LINK, 1).replace(&format!("{LINK}v/1"), LINK),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(unversioned.as_bytes()),
        Err(InvalidReviewedVerdicts::Json(_)),
    );

    let uppercase_digest = document(&verdict("overlay", LINK, 1), "").replace("2a9934", "2A9934");
    assert_matches!(
        ReviewedVerdicts::from_slice(uppercase_digest.as_bytes()),
        Err(InvalidReviewedVerdicts::Json(_)),
    );
}

#[test]
fn unordered_and_duplicate_type_verdicts_are_rejected() {
    // LINK sorts before DELIVERS by relation string, so this order is
    // descending.
    let unordered = document(
        &[
            verdict("proximal", DELIVERS, 1),
            verdict("overlay", LINK, 1),
        ]
        .join(","),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(unordered.as_bytes()),
        Err(InvalidReviewedVerdicts::UnorderedTypeVerdicts { index: 1 }),
    );

    let duplicated = document(
        &[verdict("overlay", LINK, 1), verdict("proximal", LINK, 1)].join(","),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(duplicated.as_bytes()),
        Err(InvalidReviewedVerdicts::UnorderedTypeVerdicts { index: 1 }),
    );
}

#[test]
fn repeated_versioned_url_is_rejected() {
    // Distinct relation strings in ascending order, one reviewed
    // version: corpus corruption the ordering check cannot see.
    let json = document(
        &[
            verdict("overlay", LINK, 1),
            verdict("proximal", DELIVERS, 1)
                .replace(&format!("{DELIVERS}v/1"), &format!("{LINK}v/1")),
        ]
        .join(","),
        "",
    );

    assert_matches!(
        ReviewedVerdicts::from_slice(json.as_bytes()),
        Err(InvalidReviewedVerdicts::DuplicateVersion { index: 1 }),
    );
}

#[test]
fn empty_identity_fields_are_rejected() {
    let empty_reviewer = document(
        &verdict("overlay", LINK, 1).replace("Bilal Mahmoud", ""),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(empty_reviewer.as_bytes()),
        Err(InvalidReviewedVerdicts::EmptyTypeVerdictField {
            index: 0,
            field: "reviewer"
        }),
    );

    let empty_relation = document(
        &verdict("overlay", LINK, 1).replace(&format!("hash:{LINK}"), ""),
        "",
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(empty_relation.as_bytes()),
        Err(InvalidReviewedVerdicts::EmptyTypeVerdictField {
            index: 0,
            field: "relation"
        }),
    );

    let empty_kind = document(
        "",
        r#"{"class":"proximal","kind":"","left":"a","right":"b"}"#,
    );
    assert_matches!(
        ReviewedVerdicts::from_slice(empty_kind.as_bytes()),
        Err(InvalidReviewedVerdicts::EmptyPairVerdictField {
            index: 0,
            field: "kind"
        }),
    );
}

#[test]
fn unordered_pair_verdicts_are_rejected() {
    let json = document(
        "",
        concat!(
            r#"{"class":"proximal","kind":"same-referent","left":"a","right":"b"},"#,
            r#"{"class":"proximal","kind":"same-referent","left":"a","right":"a"}"#,
        ),
    );

    assert_matches!(
        ReviewedVerdicts::from_slice(json.as_bytes()),
        Err(InvalidReviewedVerdicts::UnorderedPairVerdicts { index: 1 }),
    );
}

#[test]
fn resolution_is_version_precise() {
    let json = document(
        &[
            verdict("overlay", LINK, 9),
            verdict("proximal", DELIVERS, 2),
        ]
        .join(","),
        "",
    );
    let verdicts = ReviewedVerdicts::from_slice(json.as_bytes()).expect("the fixture conforms");

    // The snapshot holds two versions of the reviewed type; only the
    // reviewed version resolves. LINK v9 is absent entirely.
    let ontology = [
        table_entry(YIELDS, 1),
        table_entry(DELIVERS, 1),
        table_entry(DELIVERS, 2),
        table_entry(LINK, 1),
    ];

    let outcome = verdicts.resolve(&ontology);

    let resolved = outcome.resolved();
    assert_eq!(resolved.len(), 1);
    assert_eq!(resolved[0].relation.get(), 2);
    assert_eq!(resolved[0].placement, PlacementClass::Proximal);

    let unresolved = outcome.unresolved();
    assert_eq!(unresolved.len(), 1);
    assert_eq!(unresolved[0].relation, format!("hash:{LINK}"));
}

#[test]
fn resolved_verdicts_ascend_by_row() {
    // Document order is by relation string; the table reverses it, so
    // resolution must re-order by row.
    let json = document(
        &[
            verdict("overlay", LINK, 1),
            verdict("proximal", DELIVERS, 1),
            verdict("coincident", YIELDS, 1),
        ]
        .join(","),
        "",
    );
    let verdicts = ReviewedVerdicts::from_slice(json.as_bytes()).expect("the fixture conforms");

    let ontology = [
        table_entry(YIELDS, 1),
        table_entry(DELIVERS, 1),
        table_entry(LINK, 1),
    ];

    let outcome = verdicts.resolve(&ontology);
    assert!(outcome.unresolved().is_empty());

    let rows: Vec<u64> = outcome
        .resolved()
        .iter()
        .map(|verdict| verdict.relation.get())
        .collect();
    assert_eq!(rows, [0, 1, 2]);

    let placements: Vec<PlacementClass> = outcome
        .resolved()
        .iter()
        .map(|verdict| verdict.placement)
        .collect();
    assert_eq!(
        placements,
        [
            PlacementClass::Coincident,
            PlacementClass::Proximal,
            PlacementClass::Overlay,
        ],
    );
}

#[test]
fn verdicts_without_a_store_identity_are_carried_as_evidence() {
    // Foreign-corpus types (e.g. wikidata) record no versioned URL;
    // the verdict parses, never resolves, and never conflicts with
    // another identity-free verdict.
    let json = document(
        &[
            verdict("proximal", DELIVERS, 1),
            r#"{"class":"proximal","relation":"wikidata:P50","reviewer":"Bilal Mahmoud","versioned_url":null}"#
                .to_owned(),
            r#"{"class":"overlay","relation":"wikidata:P69","reviewer":"Bilal Mahmoud","versioned_url":null}"#
                .to_owned(),
        ]
        .join(","),
        "",
    );
    let verdicts = ReviewedVerdicts::from_slice(json.as_bytes()).expect("null identities conform");
    assert_eq!(verdicts.type_verdicts()[1].versioned_url, None);

    let outcome = verdicts.resolve(&[table_entry(DELIVERS, 1)]);
    assert_eq!(outcome.resolved().len(), 1);
    assert_eq!(outcome.resolved()[0].relation.get(), 0);

    let unresolved: Vec<&str> = outcome
        .unresolved()
        .iter()
        .map(|verdict| verdict.relation.as_str())
        .collect();
    assert_eq!(unresolved, ["wikidata:P50", "wikidata:P69"]);
}

#[test]
fn empty_document_resolves_to_nothing() {
    let json = document("", "");
    let verdicts =
        ReviewedVerdicts::from_slice(json.as_bytes()).expect("an empty document conforms");

    let outcome = verdicts.resolve(&[table_entry(LINK, 1)]);
    assert!(outcome.resolved().is_empty());
    assert!(outcome.unresolved().is_empty());
}
