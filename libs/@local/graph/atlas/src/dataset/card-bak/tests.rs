//! Golden tests transcribed from the Python relation-card renderer.
//!
//! The expected strings come from `tools/atlas-tools/tests/relation_cards/`
//! (`test_card.py`, `test_endpoint_constraints.py`, `test_examples.py`); the
//! rendered text is asserted byte-for-byte against those fixtures.

use super::{
    Card, CardsConfig, EndpointTypeConstraint, PhraseInput, RelationCardInput, RelationConstraints,
    RelationDirection, RelationExample, build_card,
    error::{CardError, IdentifierLeakError, TokenCountError},
    examples::{
        DEFAULT_STRATUM_SLOT_CAP, ExampleCandidate, ExampleStratum, SelectedExample,
        select_diverse_examples,
    },
    lint_card_text,
    token::{Cl100kTokenCounter, HeuristicTokenCounter, NaiveSentenceSplitter, TokenCounter as _},
};

const BIG: usize = 10_000_000;

fn cards_config(token_budget: usize, hard_token_budget: usize) -> CardsConfig {
    CardsConfig {
        token_budget,
        hard_token_budget,
    }
}

fn render(input: &RelationCardInput, config: CardsConfig) -> Result<Card, CardError> {
    build_card(
        input,
        config,
        &HeuristicTokenCounter,
        &NaiveSentenceSplitter,
        &[],
    )
}

fn phrase(label: &str, description: Option<&str>) -> PhraseInput {
    PhraseInput {
        label: label.to_owned(),
        description: description.map(str::to_owned),
    }
}

fn minimal_input(title: &str) -> RelationCardInput {
    RelationCardInput {
        language: "en".to_owned(),
        title: title.to_owned(),
        description: None,
        aliases: Vec::new(),
        inverse: None,
        ancestors: Vec::new(),
        endpoint_constraints: Vec::new(),
        source_types: Vec::new(),
        target_types: Vec::new(),
        constraints: RelationConstraints {
            symmetric: None,
            transitive: None,
            single_value: None,
            distinct_values: None,
            direction: RelationDirection::SourceToTarget,
        },
        examples: Vec::new(),
        slug: None,
    }
}

fn canonical_input() -> RelationCardInput {
    RelationCardInput {
        description: Some("this item is a part of that item".to_owned()),
        aliases: vec!["contained within".to_owned(), "component of".to_owned()],
        inverse: Some(phrase("has part", Some("this item has the listed part"))),
        ancestors: vec![phrase(
            "broader relation",
            Some("Lead ancestor sentence. Removable ancestor detail."),
        )],
        source_types: vec![phrase(
            "written work",
            Some("Lead source sentence. Removable source detail."),
        )],
        target_types: vec![phrase("creative work", Some("a creative artifact"))],
        constraints: RelationConstraints {
            symmetric: Some(false),
            transitive: Some(true),
            single_value: Some(false),
            distinct_values: Some(false),
            direction: RelationDirection::SourceToTarget,
        },
        examples: vec![
            RelationExample {
                subject_label: "Chapter One".to_owned(),
                object_label: "Synthetic Novel".to_owned(),
                stratum_label: Some("written work".to_owned()),
            },
            RelationExample {
                subject_label: "Appendix".to_owned(),
                object_label: "Field Guide".to_owned(),
                stratum_label: Some("written work".to_owned()),
            },
        ],
        ..minimal_input("part of")
    }
}

fn owns_input() -> RelationCardInput {
    RelationCardInput {
        endpoint_constraints: vec![
            EndpointTypeConstraint::new(
                phrase(
                    "Organization",
                    Some("A formal group. Additional source detail."),
                ),
                vec![
                    phrase(
                        "Subsidiary",
                        Some("A controlled company. Additional target detail."),
                    ),
                    phrase("Office", None),
                ],
                Some(1),
                Some(2),
            )
            .expect("cardinality 1..2 should validate"),
            EndpointTypeConstraint::new(
                phrase("Person", None),
                vec![phrase("Asset", None)],
                None,
                Some(1),
            )
            .expect("cardinality <= 1 should validate"),
        ],
        constraints: RelationConstraints {
            symmetric: None,
            transitive: None,
            single_value: Some(false),
            distinct_values: None,
            direction: RelationDirection::SourceToTarget,
        },
        ..minimal_input("owns")
    }
}

#[test]
fn canonical_block_rendering_is_deterministic() {
    let input = canonical_input();
    let first = render(&input, cards_config(BIG, BIG)).expect("canonical fixture should render");
    let second = render(&input, cards_config(BIG, BIG)).expect("canonical fixture should render");

    assert_eq!(first.card_text(), second.card_text());
    assert_eq!(
        first.card_text(),
        concat!(
            "Relation: part of\n",
            "Description: this item is a part of that item\n",
            "Aliases:\n",
            "  - contained within\n",
            "  - component of\n",
            "Inverse Name: has part (this item has the listed part)\n\n",
            "Ancestors:\n",
            "  - broader relation (Lead ancestor sentence. Removable ancestor detail.)\n\n",
            "Source types:\n",
            "  - written work (Lead source sentence. Removable source detail.)\n\n",
            "Target types:\n",
            "  - creative work (a creative artifact)\n\n",
            "Constraints:\n",
            "  - symmetric? no\n",
            "  - transitive? yes\n",
            "  - single value? no\n",
            "  - distinct values? no\n",
            "  - direction: source -> target\n\n",
            "Examples:\n",
            "  - written work: Chapter One -> Synthetic Novel\n",
            "  - written work: Appendix -> Field Guide\n\n",
            "Slug: part-of\n",
        )
    );
    assert!(first.truncations().is_empty());
    assert!(!first.severely_truncated());
}

#[test]
fn unavailable_constraint_facts_render_as_not_recorded() {
    let input = minimal_input("related to");
    let card = render(&input, cards_config(BIG, BIG)).expect("minimal fixture should render");
    let text = card.card_text();

    assert!(text.contains("Constraints:\n  - symmetric? not recorded\n"));
    assert!(text.contains("  - transitive? not recorded\n"));
    assert!(text.contains("  - single value? not recorded\n"));
    assert!(text.contains("  - distinct values? not recorded\n"));
    assert!(text.contains("Inverse Name: none recorded\n"));
}

#[test]
fn soft_truncation_uses_shared_structural_passes() {
    let card = render(&canonical_input(), cards_config(1, BIG))
        .expect("fixture should render after structural truncation");

    assert_eq!(
        card.truncations(),
        ["example[1]", "ancestor_details", "source_type_details"]
    );
    assert!(!card.card_text().contains("Removable ancestor detail"));
    assert!(!card.card_text().contains("Removable source detail"));
    // The direction line plus one surviving example.
    assert_eq!(card.card_text().matches(" -> ").count(), 2);
    assert!(!card.severely_truncated());
}

#[test]
fn identifier_linter_rejects_embedded_source_keys() {
    let url_input = RelationCardInput {
        description: Some("see https://example.com/types/entity-type/part-of/v/1".to_owned()),
        ..minimal_input("related to")
    };
    assert!(matches!(
        render(&url_input, cards_config(BIG, BIG)),
        Err(CardError::IdentifierLeak(IdentifierLeakError::Url))
    ));

    let uuid_input = RelationCardInput {
        description: Some("database key 123e4567-e89b-12d3-a456-426614174000".to_owned()),
        ..minimal_input("related to")
    };
    assert!(matches!(
        render(&uuid_input, cards_config(BIG, BIG)),
        Err(CardError::IdentifierLeak(IdentifierLeakError::Uuid))
    ));
}

#[test]
fn identifier_linter_allows_similar_ordinary_prose() {
    let input = RelationCardInput {
        description: Some("The Audi Q5 and release 123e4567-e89b are ordinary prose.".to_owned()),
        ..minimal_input("P2P relation")
    };

    let card =
        render(&input, cards_config(BIG, BIG)).expect("ordinary prose should pass the linter");
    assert!(card.card_text().starts_with("Relation: P2P relation\n"));
}

#[test]
fn identifier_linter_rejects_adapter_supplied_source_identifier() {
    let error = lint_card_text("Relation: source property P361\n", &["P361"])
        .expect_err("the resolved source identifier should be rejected");

    assert!(matches!(
        &error,
        IdentifierLeakError::SourceIdentifier { identifier } if identifier == "P361"
    ));
    assert!(error.to_string().contains("P361"));
}

#[test]
fn endpoint_constraints_preserve_source_target_associations() {
    let card = render(&owns_input(), cards_config(BIG, BIG))
        .expect("endpoint constraint fixture should render");
    let text = card.card_text();

    assert!(!text.contains("Source types:"));
    assert!(!text.contains("Target types:"));
    assert!(text.contains("Endpoint constraints:"));
    assert!(text.contains(concat!(
        "  - Organization (A formal group. Additional source detail.) -> ",
        "one of: Subsidiary (A controlled company. Additional target detail.) | Office ",
        "[targets per source: 1..2]\n",
    )));
    assert!(text.contains("  - Person -> Asset [targets per source: <= 1]\n"));
    assert!(!text.contains("Organization -> Asset"));
    assert!(!text.contains("Person -> Subsidiary"));
}

#[test]
fn endpoint_description_details_are_truncated_without_losing_pairs() {
    let card = render(&owns_input(), cards_config(1, BIG))
        .expect("endpoint constraint fixture should render after truncation");
    let text = card.card_text();

    assert!(
        card.truncations()
            .iter()
            .any(|label| label == "endpoint_type_details")
    );
    assert!(!text.contains("Additional source detail"));
    assert!(!text.contains("Additional target detail"));
    assert!(text.contains("Organization (A formal group.) ->"));
    assert!(text.contains("Subsidiary (A controlled company.)"));
    assert!(text.contains("Person -> Asset"));
}

#[test]
fn single_simple_pair_keeps_the_legacy_unambiguous_sections() {
    let input = RelationCardInput {
        endpoint_constraints: vec![
            EndpointTypeConstraint::new(
                phrase("Person", None),
                vec![phrase("Asset", None)],
                None,
                Some(1),
            )
            .expect("cardinality <= 1 should validate"),
        ],
        constraints: RelationConstraints {
            symmetric: None,
            transitive: None,
            single_value: Some(true),
            distinct_values: None,
            direction: RelationDirection::SourceToTarget,
        },
        ..minimal_input("owns")
    };

    let card = render(&input, cards_config(BIG, BIG)).expect("simple pair should render");
    let text = card.card_text();
    assert!(!text.contains("Endpoint constraints:"));
    assert!(text.contains("Source types:\n  - Person\n"));
    assert!(text.contains("Target types:\n  - Asset\n"));
}

#[test]
fn endpoint_cardinality_rejects_an_inverted_range() {
    assert!(
        EndpointTypeConstraint::new(phrase("Person", None), Vec::new(), Some(2), Some(1)).is_none()
    );
}

#[test]
fn cl100k_counter_matches_known_tokens_and_rejects_protocol_tokens() {
    assert_eq!(
        Cl100kTokenCounter
            .count("hello world")
            .expect("ordinary text should tokenize"),
        2
    );
    assert!(matches!(
        Cl100kTokenCounter.count("<|endoftext|>"),
        Err(TokenCountError::ReservedToken {
            token: "<|endoftext|>"
        })
    ));
}

// --- Example selection (transcribed from test_examples.py) -----------------

#[derive(Debug, Clone)]
struct Payload {
    name: String,
}

const SHARED_ENDPOINT: &str = "entity:shared";

fn candidate(name: &str) -> ExampleCandidate<Payload, &'static str> {
    ExampleCandidate {
        payload: Payload {
            name: name.to_owned(),
        },
        subject_token: format!("subject:{name}"),
        object_token: format!("object:{name}"),
        subgroup: "default",
        recognizability: 0.0,
        additional_conflict_tokens: Vec::new(),
    }
}

fn names<Stratum>(selected: &[SelectedExample<Stratum, Payload>]) -> Vec<&str> {
    selected
        .iter()
        .map(|example| example.payload.name.as_str())
        .collect()
}

#[test]
fn recognizable_head_then_distinct_subgroups_before_repeats() {
    let selected = select_diverse_examples(
        vec![ExampleStratum {
            key: "source",
            candidates: vec![
                ExampleCandidate {
                    subgroup: "country",
                    recognizability: 10.0,
                    ..candidate("France")
                },
                ExampleCandidate {
                    subgroup: "country",
                    recognizability: 9.0,
                    ..candidate("Spain")
                },
                ExampleCandidate {
                    subgroup: "village",
                    recognizability: 1.0,
                    ..candidate("Casefabre")
                },
            ],
        }],
        3,
        DEFAULT_STRATUM_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["France", "Casefabre", "Spain"]);
}

#[test]
fn slot_cap_preserves_small_strata_then_relaxes_to_fill_budget() {
    let selected = select_diverse_examples(
        vec![
            ExampleStratum {
                key: "large",
                candidates: (0..20)
                    .map(|index| candidate(&format!("large-{index}")))
                    .collect(),
            },
            ExampleStratum {
                key: "small",
                candidates: (0..2)
                    .map(|index| candidate(&format!("small-{index}")))
                    .collect(),
            },
        ],
        8,
        DEFAULT_STRATUM_SLOT_CAP,
    );

    let strata: Vec<_> = selected.iter().map(|example| example.stratum).collect();
    assert_eq!(
        strata,
        [
            "large", "large", "large", "large", "large", "large", "small", "small",
        ]
    );
}

#[test]
fn endpoint_conflict_shortfall_refills_from_another_stratum() {
    let selected = select_diverse_examples(
        vec![
            ExampleStratum {
                key: "first",
                candidates: vec![ExampleCandidate {
                    object_token: SHARED_ENDPOINT.to_owned(),
                    ..candidate("first")
                }],
            },
            ExampleStratum {
                key: "conflicting",
                candidates: vec![ExampleCandidate {
                    object_token: SHARED_ENDPOINT.to_owned(),
                    ..candidate("conflicting")
                }],
            },
            ExampleStratum {
                key: "refill",
                candidates: vec![candidate("refill-1"), candidate("refill-2")],
            },
        ],
        3,
        DEFAULT_STRATUM_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["first", "refill-1", "refill-2"]);
}

#[test]
fn additional_conflict_token_skips_duplicate_text_but_keeps_alternates() {
    let duplicate_line = "rendered:source\0A\0B";
    let selected = select_diverse_examples(
        vec![ExampleStratum {
            key: "source",
            candidates: vec![
                ExampleCandidate {
                    recognizability: 3.0,
                    additional_conflict_tokens: vec![duplicate_line.to_owned()],
                    ..candidate("first")
                },
                ExampleCandidate {
                    recognizability: 2.0,
                    additional_conflict_tokens: vec![duplicate_line.to_owned()],
                    ..candidate("duplicate")
                },
                ExampleCandidate {
                    recognizability: 1.0,
                    ..candidate("alternate")
                },
            ],
        }],
        3,
        DEFAULT_STRATUM_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["first", "alternate"]);
}

#[test]
fn empty_strata_do_not_consume_guaranteed_slots() {
    let selected = select_diverse_examples(
        vec![
            ExampleStratum {
                key: "empty",
                candidates: Vec::new(),
            },
            ExampleStratum {
                key: "alpha",
                candidates: vec![candidate("a")],
            },
            ExampleStratum {
                key: "beta",
                candidates: vec![candidate("b")],
            },
        ],
        2,
        DEFAULT_STRATUM_SLOT_CAP,
    );

    let strata: Vec<_> = selected.iter().map(|example| example.stratum).collect();
    assert_eq!(strata, ["alpha", "beta"]);
}

// The Python suite also rejects a negative example count and a zero slot cap
// at runtime; both are unrepresentable here (`count` is unsigned and
// `slot_cap` is `NonZeroUsize`), so no test is transcribed.
