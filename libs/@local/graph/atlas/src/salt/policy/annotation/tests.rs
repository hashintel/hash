use core::assert_matches;

use serde_json::{Value, json};

use super::{
    ANNOTATION_CORPUS_SCHEMA, AnnotationCorpus, CardIdentity, Direction, HoldoutClass,
    InvalidAnnotationCorpus, Source, VoteVerdict,
};
use crate::salt::policy::GeometryClass;

const DIGEST: &str = "2a9934acae8bf210b6a3428e553b1bcc0e220a4de113940782cd573da1ea4f4b";
const OTHER_DIGEST: &str = "33ddbf6ffdd995dc23be2e7d4e9a05ec57b50a0ab03b0f8f44edbb26f36cf059";
const EMPLOYED_BY: &str = "https://hash.ai/@h/types/entity-type/employed-by/v/1";
const PART_OF: &str = "http://www.wikidata.org/entity/P361";

/// Composes one vote with conforming provenance.
fn vote(verdict: &str) -> Value {
    json!({
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
        "verdict": verdict,
    })
}

/// Composes a full-featured wikidata card.
fn wikidata_card() -> Value {
    json!({
        "axes": {
            "base_url": PART_OF,
            "family": "f-0042",
            "inverse_of": ["http://www.wikidata.org/entity/P527"],
            "publisher": "wikidata",
        },
        "content": {
            "aliases": ["component of"],
            "ancestors": [{"description": null, "label": "partially coincident with"}],
            "constraints": {
                "direction": "source -> target",
                "distinct_values": null,
                "single_value": null,
                "symmetric": false,
                "transitive": true,
            },
            "description": "The subject is a part of the object.",
            "endpoint_constraints": [{
                "maximum_targets": null,
                "minimum_targets": null,
                "source_type": {"description": "A material thing", "label": "physical object"},
                "target_types": [{"description": null, "label": "physical object"}],
            }],
            "examples": [{
                "object_label": "Solar System",
                "stratum_label": null,
                "subject_label": "Earth",
            }],
            "inverse": {"description": "The object is a part of the subject.", "label": "has part"},
            "language": "en",
            "slug": "part-of",
            "source_types": [{"description": "A material thing", "label": "physical object"}],
            "target_types": [{"description": "A material thing", "label": "physical object"}],
            "title": "part of",
        },
        "flags": {"holdout": null, "prescreen_stratum": "unstratified", "shot_excluded": false},
        "identity": PART_OF,
        "retrieved_at": "Sat, 11 Jul 2026 21:49:25 GMT",
        "source": "wikidata",
        "source_record_hash": DIGEST,
        "votes": [vote("proximal"), vote("proximal"), vote("overlay"), vote("unclear"), vote("abstain")],
    })
}

/// Composes a sparse hash card, with the live corpus's presence
/// realism: no aliases, examples, endpoint constraints, or inverse.
fn hash_card() -> Value {
    json!({
        "axes": {
            "base_url": "https://hash.ai/@h/types/entity-type/employed-by/",
            "family": "f-0007",
            "inverse_of": [],
            "publisher": "hash.ai/@h",
        },
        "content": {
            "aliases": [],
            "ancestors": [{"description": null, "label": "link"}],
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
        "votes": [vote("coincident"), vote("proximal")],
    })
}

/// Composes a wire document over `cards` as given.
fn document(cards: &[Value]) -> String {
    json!({
        "cards": cards,
        "schema": ANNOTATION_CORPUS_SCHEMA,
        "sources": {"cards.jsonl": DIGEST},
    })
    .to_string()
}

#[test]
fn the_shipped_shape_parses() {
    let json = document(&[wikidata_card(), hash_card()]);

    let corpus = AnnotationCorpus::from_slice(json.as_bytes())
        .expect("a contract-conforming document parses");

    let cards = corpus.cards();
    assert_eq!(cards.len(), 2);

    let CardIdentity::Wikidata {
        url,
        retrieved_at,
        source_record_hash,
    } = &cards[0].identity
    else {
        panic!("the first card records a wikidata identity");
    };
    assert_eq!(&**url, PART_OF);
    assert_eq!(&**retrieved_at, "Sat, 11 Jul 2026 21:49:25 GMT");
    assert_eq!(source_record_hash.to_string(), DIGEST);
    assert_eq!(
        cards[0].content.constraints.direction,
        Direction::SourceToTarget
    );
    assert_eq!(cards[0].content.constraints.symmetric, Some(false));
    assert_eq!(cards[0].content.constraints.single_value, None);
    assert_eq!(cards[0].votes[3].verdict, VoteVerdict::Unclear);
    assert_eq!(cards[0].axes.publisher, "wikidata");

    let CardIdentity::Hash(url) = &cards[1].identity else {
        panic!("the second card records a hash identity");
    };
    assert_eq!(url.to_string(), EMPLOYED_BY);
    assert_eq!(cards[1].identity.canonical_url(), EMPLOYED_BY);
    assert!(cards[1].content.inverse.is_none());
    assert!(cards[1].flags.expects_evidence());
    assert!(cards[0].flags.expects_evidence());

    assert_eq!(
        corpus
            .sources()
            .get("cards.jsonl")
            .expect("the fixture records one source")
            .to_string(),
        DIGEST,
    );
}

#[test]
fn vote_counts_fold_excludes_unclear_and_abstain() {
    let json = document(&[wikidata_card()]);
    let corpus = AnnotationCorpus::from_slice(json.as_bytes()).expect("the fixture parses");

    let counts = corpus.cards()[0].vote_counts();
    assert_eq!(counts.geometry[GeometryClass::Coincident.index()], 0);
    assert_eq!(counts.geometry[GeometryClass::Proximal.index()], 2);
    assert_eq!(counts.geometry[GeometryClass::Overlay.index()], 1);
    assert_eq!(counts.unclear, 1);
    assert_eq!(counts.abstain, 1);
    assert_eq!(counts.weight(), 3);
}

#[test]
fn a_foreign_schema_is_rejected() {
    let json =
        document(&[hash_card()]).replace(ANNOTATION_CORPUS_SCHEMA, "atlas-annotation-corpus/2");

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::Schema { found }) if &*found == "atlas-annotation-corpus/2",
    );
}

#[test]
fn unordered_cards_are_rejected() {
    let json = document(&[hash_card(), wikidata_card()]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::UnorderedCards { index: 1 }),
    );
}

#[test]
fn a_duplicated_identity_is_rejected() {
    let json = document(&[hash_card(), hash_card()]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::UnorderedCards { index: 1 }),
    );
}

#[test]
fn a_base_url_hash_identity_is_rejected() {
    let mut card = hash_card();
    card["identity"] = json!("https://hash.ai/@h/types/entity-type/employed-by/");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::IdentityForm {
            index: 0,
            source: Source::Hash,
        }),
    );
}

#[test]
fn a_wikidata_identity_off_the_entity_namespace_is_rejected() {
    let mut card = wikidata_card();
    card["identity"] = json!("http://www.wikidata.org/wiki/P361");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::IdentityForm {
            index: 0,
            source: Source::Wikidata,
        }),
    );
}

#[test]
fn a_wikidata_card_without_pins_is_rejected() {
    let mut card = wikidata_card();
    card["retrieved_at"] = json!(null);
    let json = document(&[card]);
    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::MissingPin {
            index: 0,
            field: "retrieved_at",
        }),
    );

    let mut card = wikidata_card();
    card["source_record_hash"] = json!(null);
    let json = document(&[card]);
    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::MissingPin {
            index: 0,
            field: "source_record_hash",
        }),
    );
}

#[test]
fn a_hash_card_with_pins_is_rejected() {
    let mut card = hash_card();
    card["retrieved_at"] = json!("2026-07-18T12:00:00Z");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::ForbiddenPin {
            index: 0,
            field: "retrieved_at",
        }),
    );
}

#[test]
fn a_url_scheme_in_prose_is_rejected() {
    let mut card = hash_card();
    card["content"]["title"] = json!("Employed By (https://hash.ai)");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::IdentifierInContent {
            index: 0,
            field: "title",
        }),
    );
}

#[test]
fn a_uuid_shaped_token_in_prose_is_rejected() {
    let mut card = hash_card();
    card["content"]["description"] = json!("See 6cf1a866-93da-441a-9c86-ed4dcf2bcdad for details.");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::IdentifierInContent {
            index: 0,
            field: "description",
        }),
    );
}

#[test]
fn a_null_description_admits() {
    let mut card = wikidata_card();
    card["content"]["description"] = json!(null);
    let json = document(&[card]);

    let corpus = AnnotationCorpus::from_slice(json.as_bytes())
        .expect("sanitization can drop every sentence");
    assert!(corpus.cards()[0].content.description.is_none());
}

#[test]
fn an_empty_required_field_is_rejected() {
    let mut card = hash_card();
    card["content"]["title"] = json!("");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::EmptyField {
            index: 0,
            field: "title",
        }),
    );
}

#[test]
fn an_empty_axis_entry_is_rejected() {
    let mut card = hash_card();
    card["axes"]["inverse_of"] = json!([""]);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::EmptyField {
            index: 0,
            field: "inverse_of",
        }),
    );
}

#[test]
fn a_shot_excluded_card_with_votes_is_rejected() {
    let mut card = hash_card();
    card["flags"]["shot_excluded"] = json!(true);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::ShotExcludedVotes { index: 0 }),
    );
}

#[test]
fn a_shot_excluded_card_without_votes_admits() {
    let mut card = hash_card();
    card["flags"]["shot_excluded"] = json!(true);
    card["votes"] = json!([]);
    let json = document(&[card]);

    let corpus = AnnotationCorpus::from_slice(json.as_bytes()).expect("the flagged card admits");
    assert!(corpus.cards()[0].flags.shot_excluded);
    assert_eq!(corpus.cards()[0].vote_counts().weight(), 0);
}

#[test]
fn an_all_unclear_card_admits_with_zero_weight() {
    let mut card = hash_card();
    card["votes"] = json!([vote("unclear"), vote("unclear")]);
    let json = document(&[card]);

    let corpus =
        AnnotationCorpus::from_slice(json.as_bytes()).expect("ambiguity is honest evidence");
    let counts = corpus.cards()[0].vote_counts();
    assert_eq!(counts.unclear, 2);
    assert_eq!(counts.weight(), 0);
}

#[test]
fn an_abstain_only_card_is_rejected() {
    let mut card = hash_card();
    card["votes"] = json!([vote("abstain")]);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::NoEvidence { index: 0 }),
    );
}

#[test]
fn a_voteless_card_without_flags_is_rejected() {
    let mut card = hash_card();
    card["votes"] = json!([]);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::NoEvidence { index: 0 }),
    );
}

#[test]
fn disagreeing_vote_card_hashes_are_rejected() {
    let mut card = hash_card();
    card["votes"][1]["card_hash"] = json!(OTHER_DIGEST);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::DisagreeingCardHash { index: 0 }),
    );
}

#[test]
fn a_holdout_card_admits_without_geometry_votes() {
    let mut card = hash_card();
    card["flags"]["holdout"] = json!("proximal");
    card["votes"] = json!([]);
    let json = document(&[card]);

    let corpus = AnnotationCorpus::from_slice(json.as_bytes()).expect("the flagged card admits");
    assert_eq!(
        corpus.cards()[0]
            .flags
            .holdout
            .expect("the fixture records a holdout class")
            .geometry(),
        Some(GeometryClass::Proximal),
    );
    assert_eq!(
        corpus.cards()[0].flags.holdout,
        Some(HoldoutClass::Proximal),
    );
}

#[test]
fn an_unclear_holdout_admits() {
    let mut card = hash_card();
    card["flags"]["holdout"] = json!("unclear");
    card["votes"] = json!([]);
    let json = document(&[card]);

    let corpus = AnnotationCorpus::from_slice(json.as_bytes()).expect("the flagged card admits");
    assert_eq!(
        corpus.cards()[0]
            .flags
            .holdout
            .expect("the fixture records a holdout class")
            .geometry(),
        None,
    );
}

#[test]
fn inverted_endpoint_bounds_are_rejected() {
    let mut card = wikidata_card();
    card["content"]["endpoint_constraints"][0]["minimum_targets"] = json!(2);
    card["content"]["endpoint_constraints"][0]["maximum_targets"] = json!(1);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::EndpointBounds {
            index: 0,
            constraint: 0,
        }),
    );
}

#[test]
fn a_missing_tristate_key_is_rejected() {
    let mut card = hash_card();
    card["content"]["constraints"]
        .as_object_mut()
        .expect("constraints is an object")
        .remove("transitive");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::Json(_)),
    );
}

#[test]
fn an_unknown_field_is_rejected() {
    let mut card = hash_card();
    card["embedding"] = json!([0.25, 0.25]);
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::Json(_)),
    );
}

#[test]
fn an_empty_vote_provenance_field_is_rejected() {
    let mut card = hash_card();
    card["votes"][0]["model_pinned"] = json!("");
    let json = document(&[card]);

    assert_matches!(
        AnnotationCorpus::from_slice(json.as_bytes()),
        Err(InvalidAnnotationCorpus::EmptyVoteField {
            index: 0,
            vote: 0,
            field: "model_pinned",
        }),
    );
}
