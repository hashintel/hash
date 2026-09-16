//! Fixture tests for the canonical card format.
//!
//! The rendering fixtures carry the format's expected strings. The canonical one compares its
//! whole rendered text byte-for-byte, and the rest compare the exact lines they concern. A layout
//! change under those lines is a deliberate format revision. The selection fixtures read the
//! chosen examples themselves and render nothing.
use alloc::borrow::Cow;
use core::assert_matches;

use super::{
    CardContext, CardsConfig, Cl100kTokenizer, UnicodeSegmenter, build_card,
    constraints::{Constraints, Direction, EndpointConstraint},
    contents::CardContents,
    epilogue::Epilogue,
    example::Example,
    format::{Card, CardError},
    group::GroupItem,
    lint::{IdentifierLeakError, lint_card_text},
    phrase::Phrase,
    prelude::Prelude,
    select::{Candidate, DEFAULT_GROUP_SLOT_CAP, Group, Selected, select_diverse_examples},
    token::{HeuristicTokenizer, ReservedTokenError, Tokenizer as _},
};

/// A token budget no fixture card reaches.
const BIG: usize = 10_000_000;

/// Normalizes a label into a slug.
///
/// Words separated by whitespace join with hyphens, and the result lowercases its ASCII letters.
/// Fixture labels carry nothing else.
fn slugify(label: &str) -> String {
    let mut label: String = label.split_whitespace().intersperse("-").collect();
    label.make_ascii_lowercase();
    label
}

/// Builds an English card context with the Unicode segmenter and the offline heuristic tokenizer.
fn context() -> CardContext<UnicodeSegmenter, HeuristicTokenizer> {
    CardContext {
        language: "en",
        segmenter: UnicodeSegmenter,
        tokenizer: HeuristicTokenizer,
    }
}

/// Builds a cards config with the given soft and hard token budgets.
fn cards_config(token_budget: usize, hard_token_budget: usize) -> CardsConfig {
    CardsConfig {
        token_budget,
        hard_token_budget,
    }
}

/// Builds a card from `contents` under `config`.
///
/// The build uses the heuristic tokenizer and no source identifiers to lint against.
///
/// # Errors
///
/// Returns [`CardError::Lint`] when the rendered text embeds a URL or a UUID, which the fixtures
/// exercise. The empty identifier list rules out [`IdentifierLeakError::SourceIdentifier`], the
/// heuristic tokenizer cannot reject a text, and [`CardError::Token`] is uninhabited at this
/// instantiation.
fn render(contents: CardContents<'_>, config: CardsConfig) -> Result<Card, CardError<!>> {
    build_card(contents, config, &HeuristicTokenizer, &[])
}

/// Builds a phrase from `label` and an optional description under the test context.
///
/// # Panics
///
/// Panics when `label` normalizes to empty, which an empty label does and so does one holding only
/// whitespace.
fn phrase<'text>(label: &'text str, description: Option<&'text str>) -> Phrase<'text> {
    Phrase::new(label, description, &context())
        .unwrap_or_else(|never| never)
        .expect("fixture labels are non-empty")
}

/// Builds card contents holding only the relation `title`.
///
/// The contents carry no inverse, empty sections, every constraint unrecorded and a slug derived
/// from the title.
fn minimal_contents(title: &'static str) -> CardContents<'static> {
    CardContents {
        prelude: Prelude {
            relation: Cow::Borrowed(title),
            description: None,
            aliases: Vec::new(),
            inverse: None,
        },
        ancestors: Vec::new(),
        source_types: Vec::new(),
        target_types: Vec::new(),
        endpoint_constraints: Vec::new(),
        constraints: Constraints {
            symmetric: None,
            transitive: None,
            singleton: None,
            distinct: None,
            direction: Direction::SourceToTarget,
        },
        examples: Vec::new(),
        epilogue: Epilogue {
            slug: Cow::Owned(slugify(title)),
        },
    }
}

/// Builds a grouped example pairing `source` with `target` under `group`.
///
/// # Panics
///
/// Panics through [`phrase`] when either endpoint label normalizes to empty.
fn example(
    source: &'static str,
    target: &'static str,
    group: &'static str,
) -> GroupItem<'static, Example<'static>> {
    GroupItem {
        data: Example {
            source: phrase(source, None),
            target: phrase(target, None),
        },
        group: Some(Cow::Borrowed(group)),
    }
}

/// Builds the fully populated "part of" fixture.
///
/// It carries a description, two aliases, an inverse, one ancestor and one source type with
/// removable detail sentences, one target type without one, every constraint recorded and two
/// grouped examples.
fn canonical_contents() -> CardContents<'static> {
    CardContents {
        prelude: Prelude {
            relation: Cow::Borrowed("part of"),
            description: Some(Cow::Borrowed("this item is a part of that item")),
            aliases: vec![
                Cow::Borrowed("contained within"),
                Cow::Borrowed("component of"),
            ],
            inverse: Some(phrase("has part", Some("this item has the listed part"))),
        },
        ancestors: vec![phrase(
            "broader relation",
            Some("Lead ancestor sentence. Removable ancestor detail."),
        )],
        source_types: vec![phrase(
            "written work",
            Some("Lead source sentence. Removable source detail."),
        )],
        target_types: vec![phrase("creative work", Some("a creative artifact"))],
        constraints: Constraints {
            symmetric: Some(false),
            transitive: Some(true),
            singleton: Some(false),
            distinct: Some(false),
            direction: Direction::SourceToTarget,
        },
        examples: vec![
            example("Chapter One", "Synthetic Novel", "written work"),
            example("Appendix", "Field Guide", "written work"),
        ],
        ..minimal_contents("part of")
    }
}

/// Builds the "owns" fixture with paired endpoint constraints.
///
/// The organization constraint allows one or two of subsidiary or office, while the person
/// constraint allows at most one asset.
fn owns_contents() -> CardContents<'static> {
    CardContents {
        endpoint_constraints: vec![
            EndpointConstraint::new(
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
            EndpointConstraint::new(
                phrase("Person", None),
                vec![phrase("Asset", None)],
                None,
                Some(1),
            )
            .expect("cardinality <= 1 should validate"),
        ],
        constraints: Constraints {
            symmetric: None,
            transitive: None,
            singleton: Some(false),
            distinct: None,
            direction: Direction::SourceToTarget,
        },
        ..minimal_contents("owns")
    }
}

/// `Card::verbatim` adopts the text unchanged.
///
/// It counts `ceil(bytes / 4)` heuristic tokens and reports no truncation.
#[test]
fn verbatim_adopts_text_with_heuristic_diagnostics() {
    let card = Card::verbatim("Relation: fixture".to_owned());

    assert_eq!(card.card_text(), "Relation: fixture");
    // 17 UTF-8 bytes count as ceil(17 / 4) = 5 heuristic tokens.
    assert_eq!(card.token_count(), 5);
    assert!(card.truncations().is_empty());
    assert!(!card.severely_truncated());
}

/// Rendering the canonical fixture twice yields the same text.
///
/// The text equals the expected section-by-section block layout, with no truncations.
#[test]
fn canonical_block_rendering_is_deterministic() {
    let first =
        render(canonical_contents(), cards_config(BIG, BIG)).expect("canonical fixture renders");
    let second =
        render(canonical_contents(), cards_config(BIG, BIG)).expect("canonical fixture renders");

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

/// Every unrecorded constraint renders as `not recorded` and a missing inverse as `none recorded`.
#[test]
fn unavailable_constraint_facts_render_as_not_recorded() {
    let card = render(minimal_contents("related to"), cards_config(BIG, BIG))
        .expect("minimal fixture renders");
    let text = card.card_text();

    assert!(text.contains("Constraints:\n  - symmetric? not recorded\n"));
    assert!(text.contains("  - transitive? not recorded\n"));
    assert!(text.contains("  - single value? not recorded\n"));
    assert!(text.contains("  - distinct values? not recorded\n"));
    assert!(text.contains("Inverse Name: none recorded\n"));
}

/// Under a one-token soft budget the canonical fixture drops the second example first.
///
/// The ancestor and source-type details follow. One example survives, and the card reports no
/// severe truncation.
#[test]
fn soft_truncation_uses_shared_structural_passes() {
    let card = render(canonical_contents(), cards_config(1, BIG))
        .expect("fixture renders after structural truncation");

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

/// A description containing a type URL fails with `IdentifierLeakError::Url`.
///
/// One containing a UUID fails with `IdentifierLeakError::Uuid`.
#[test]
fn identifier_linter_rejects_embedded_source_keys() {
    let mut url_contents = minimal_contents("related to");
    url_contents.prelude.description = Some(Cow::Borrowed(
        "see https://example.com/types/entity-type/part-of/v/1",
    ));
    assert_matches!(
        render(url_contents, cards_config(BIG, BIG)),
        Err(CardError::Lint(IdentifierLeakError::Url))
    );

    let mut uuid_contents = minimal_contents("related to");
    uuid_contents.prelude.description = Some(Cow::Borrowed(
        "database key 123e4567-e89b-12d3-a456-426614174000",
    ));
    assert_matches!(
        render(uuid_contents, cards_config(BIG, BIG)),
        Err(CardError::Lint(IdentifierLeakError::Uuid))
    );
}

/// Prose that merely resembles identifiers passes the linter and renders.
///
/// The cases are `P2P`, `Q5` and a short hex fragment.
#[test]
fn identifier_linter_allows_similar_ordinary_prose() {
    let mut contents = minimal_contents("P2P relation");
    contents.prelude.description = Some(Cow::Borrowed(
        "The Audi Q5 and release 123e4567-e89b are ordinary prose.",
    ));

    let card = render(contents, cards_config(BIG, BIG)).expect("ordinary prose passes the linter");
    assert!(card.card_text().starts_with("Relation: P2P relation\n"));
}

/// `lint_card_text` rejects text containing an adapter-supplied source identifier.
///
/// `SourceIdentifier` names it, and the message repeats the identifier.
#[test]
fn identifier_linter_rejects_adapter_supplied_source_identifier() {
    let error = lint_card_text("Relation: source property P361\n", &["P361"])
        .expect_err("the resolved source identifier should be rejected");

    assert_matches!(
        &error,
        IdentifierLeakError::SourceIdentifier { identifier } if identifier == "P361"
    );
    assert!(error.to_string().contains("P361"));
}

/// Endpoint constraints render as an `Endpoint constraints:` section.
///
/// The section pairs each source with its own targets and cardinality, replaces the flat source and
/// target type sections, and never cross-pairs.
#[test]
fn endpoint_constraints_preserve_source_target_associations() {
    let card = render(owns_contents(), cards_config(BIG, BIG))
        .expect("endpoint constraint fixture renders");
    let text = card.card_text();

    assert!(!text.contains("Source types:"));
    assert!(!text.contains("Target types:"));
    assert!(text.contains("Endpoint constraints:"));
    assert!(text.contains(concat!(
        "  - Organization (A formal group. Additional source detail.) -> ",
        "one of: Subsidiary (A controlled company. Additional target detail.) | Office ",
        "[targets per source: 1..2 (inclusive)]\n",
    )));
    assert!(text.contains("  - Person -> Asset [targets per source: <= 1]\n"));
    assert!(!text.contains("Organization -> Asset"));
    assert!(!text.contains("Person -> Subsidiary"));
}

/// Under a one-token soft budget the `endpoint_type_details` pass trims description details.
///
/// Endpoint phrases keep their lead sentence, and every source-target pair survives.
#[test]
fn endpoint_description_details_are_truncated_without_losing_pairs() {
    let card = render(owns_contents(), cards_config(1, BIG))
        .expect("endpoint constraint fixture renders after truncation");
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

/// One constraint with a single source and target renders as plain type sections.
///
/// With no cardinality beyond the singleton flag the card keeps `Source types:` and `Target types:`
/// rather than an endpoint section.
#[test]
fn single_simple_pair_keeps_the_legacy_unambiguous_sections() {
    let contents = CardContents {
        endpoint_constraints: vec![
            EndpointConstraint::new(
                phrase("Person", None),
                vec![phrase("Asset", None)],
                None,
                Some(1),
            )
            .expect("cardinality <= 1 should validate"),
        ],
        constraints: Constraints {
            symmetric: None,
            transitive: None,
            singleton: Some(true),
            distinct: None,
            direction: Direction::SourceToTarget,
        },
        ..minimal_contents("owns")
    };

    let card = render(contents, cards_config(BIG, BIG)).expect("simple pair renders");
    let text = card.card_text();
    assert!(!text.contains("Endpoint constraints:"));
    assert!(text.contains("Source types:\n  - Person\n"));
    assert!(text.contains("Target types:\n  - Asset\n"));
}

/// `EndpointConstraint::new` returns `None` when the minimum exceeds the maximum.
#[test]
fn endpoint_cardinality_rejects_an_inverted_range() {
    assert!(
        EndpointConstraint::<'_>::new(phrase("Person", None), Vec::new(), Some(2), Some(1))
            .is_none()
    );
}

/// `Cl100kTokenizer` counts two tokens for `hello world`.
///
/// It rejects `<|endoftext|>` with `ReservedTokenError` naming the token.
#[test]
fn cl100k_tokenizer_matches_known_tokens_and_rejects_protocol_tokens() {
    assert_eq!(
        Cl100kTokenizer
            .count_tokens("hello world")
            .expect("ordinary text should tokenize"),
        2
    );
    assert_matches!(
        Cl100kTokenizer.count_tokens("<|endoftext|>"),
        Err(ReservedTokenError {
            token: "<|endoftext|>"
        })
    );
}

/// The candidate payload the selection tests identify results by.
struct Payload {
    name: String,
}

/// An endpoint two candidates share.
const SHARED_ENDPOINT: &str = "entity:shared";

/// Builds a candidate named `name` in the `default` subgroup with zero recognizability.
///
/// Its endpoints derive from the name and it carries no conflicts.
fn candidate(name: &str) -> Candidate<'static, Payload, &'static str> {
    Candidate {
        payload: Payload {
            name: name.to_owned(),
        },
        source: Cow::Owned(format!("source:{name}")),
        target: Cow::Owned(format!("target:{name}")),
        subgroup: "default",
        recognizability: 0.0,
        conflicts: Vec::new(),
    }
}

/// The payload names of `selected`, in selection order.
fn names<K>(selected: &[Selected<K, Payload>]) -> Vec<&str> {
    selected
        .iter()
        .map(|example| example.payload.name.as_str())
        .collect()
}

/// Selection takes the most recognizable candidate first.
///
/// A candidate from a not-yet-seen subgroup follows, and only then does a subgroup repeat.
#[test]
fn recognizable_head_then_distinct_subgroups_before_repeats() {
    let selected = select_diverse_examples(
        vec![Group {
            key: "source",
            candidates: vec![
                Candidate {
                    subgroup: "country",
                    recognizability: 10.0,
                    ..candidate("France")
                },
                Candidate {
                    subgroup: "country",
                    recognizability: 9.0,
                    ..candidate("Spain")
                },
                Candidate {
                    subgroup: "village",
                    recognizability: 1.0,
                    ..candidate("Casefabre")
                },
            ],
        }],
        3,
        DEFAULT_GROUP_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["France", "Casefabre", "Spain"]);
}

/// A budget of eight over a twenty-candidate and a two-candidate group fills the budget.
///
/// The small group keeps both its slots and the large group fills the remaining six.
#[test]
fn slot_cap_preserves_small_groups_then_relaxes_to_fill_budget() {
    let selected = select_diverse_examples(
        vec![
            Group {
                key: "large",
                candidates: (0..20)
                    .map(|index| candidate(&format!("large-{index}")))
                    .collect(),
            },
            Group {
                key: "small",
                candidates: (0..2)
                    .map(|index| candidate(&format!("small-{index}")))
                    .collect(),
            },
        ],
        8,
        DEFAULT_GROUP_SLOT_CAP,
    );

    let groups: Vec<_> = selected.iter().map(|example| example.group).collect();
    assert_eq!(
        groups,
        [
            "large", "large", "large", "large", "large", "large", "small", "small",
        ]
    );
}

#[test]
fn endpoint_conflict_shortfall_refills_from_another_group() {
    let selected = select_diverse_examples(
        vec![
            Group {
                key: "first",
                candidates: vec![Candidate {
                    target: Cow::Borrowed(SHARED_ENDPOINT),
                    ..candidate("first")
                }],
            },
            Group {
                key: "conflicting",
                candidates: vec![Candidate {
                    target: Cow::Borrowed(SHARED_ENDPOINT),
                    ..candidate("conflicting")
                }],
            },
            Group {
                key: "refill",
                candidates: vec![candidate("refill-1"), candidate("refill-2")],
            },
        ],
        3,
        DEFAULT_GROUP_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["first", "refill-1", "refill-2"]);
}

#[test]
fn conflict_token_skips_duplicate_text_but_keeps_alternates() {
    let duplicate_line = "rendered:source\0A\0B";
    let selected = select_diverse_examples(
        vec![Group {
            key: "source",
            candidates: vec![
                Candidate {
                    recognizability: 3.0,
                    conflicts: vec![Cow::Borrowed(duplicate_line)],
                    ..candidate("first")
                },
                Candidate {
                    recognizability: 2.0,
                    conflicts: vec![Cow::Borrowed(duplicate_line)],
                    ..candidate("duplicate")
                },
                Candidate {
                    recognizability: 1.0,
                    ..candidate("alternate")
                },
            ],
        }],
        3,
        DEFAULT_GROUP_SLOT_CAP,
    );

    assert_eq!(names(&selected), ["first", "alternate"]);
}

#[test]
fn empty_groups_do_not_consume_guaranteed_slots() {
    let selected = select_diverse_examples(
        vec![
            Group {
                key: "empty",
                candidates: Vec::new(),
            },
            Group {
                key: "alpha",
                candidates: vec![candidate("a")],
            },
            Group {
                key: "beta",
                candidates: vec![candidate("b")],
            },
        ],
        2,
        DEFAULT_GROUP_SLOT_CAP,
    );

    let groups: Vec<_> = selected.iter().map(|example| example.group).collect();
    assert_eq!(groups, ["alpha", "beta"]);
}
