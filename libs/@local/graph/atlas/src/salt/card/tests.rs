use crate::salt::card::{
    CardBudgets, CardError, Cl100kTokenCounter, HeuristicTokenCounter, NaiveSentenceSplitter,
    PhraseInput, RelationCardInput, RelationConstraints, RelationDirection, RelationExample,
    TokenCountError, TokenCounter, Truncation, build_card,
};

const ALIASES: [&str; 2] = ["contained within", "component of"];
const ANCESTORS: [PhraseInput<'static>; 1] = [PhraseInput {
    label: "broader relation",
    description: Some("Lead ancestor sentence. Removable ancestor detail."),
}];
const SOURCE_TYPES: [PhraseInput<'static>; 1] = [PhraseInput {
    label: "written work",
    description: Some("Lead source sentence. Removable source detail."),
}];
const TARGET_TYPES: [PhraseInput<'static>; 1] = [PhraseInput {
    label: "creative work",
    description: Some("a creative artifact"),
}];
const EXAMPLES: [RelationExample<'static>; 2] = [
    RelationExample {
        subject_label: "Chapter One",
        object_label: "Synthetic Novel",
        stratum_label: Some("written work"),
    },
    RelationExample {
        subject_label: "Appendix",
        object_label: "Field Guide",
        stratum_label: Some("written work"),
    },
];

#[test]
fn canonical_rendering_matches_the_format_v5_golden() {
    let card = render(canonical_input(), CardBudgets::new(10_000, 10_000).unwrap())
        .expect("canonical fixture should render");

    assert_eq!(
        card.text(),
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
    assert_eq!(
        card.hash().to_string(),
        "2a47b0e6285e830a4d36e6ac3ef9f5297475d844d72ea498c39bd67265ceabda"
    );
    assert_eq!(card.token_count(), 159);
    assert!(card.truncations().is_empty());
    assert!(!card.severely_truncated());
}

#[test]
fn soft_truncation_follows_structural_pass_order() {
    let card = render(canonical_input(), CardBudgets::new(1, 10_000).unwrap())
        .expect("fixture should render after structural truncation");

    assert_eq!(
        card.truncations(),
        &[
            Truncation::Example { index: 1 },
            Truncation::AncestorDetails,
            Truncation::SourceTypeDetails,
        ]
    );
    assert!(!card.text().contains("Removable ancestor detail"));
    assert!(!card.text().contains("Removable source detail"));
    assert_eq!(card.text().matches(" -> ").count(), 2);
    assert!(!card.severely_truncated());
}

#[test]
fn hard_truncation_preserves_required_semantic_blocks() {
    let card = render(canonical_input(), CardBudgets::new(1, 1).unwrap())
        .expect("over-budget required fields should remain renderable");

    assert!(card.truncations().contains(&Truncation::ExamplesSection));
    assert!(card.truncations().contains(&Truncation::AncestorsSection));
    assert!(!card.text().contains("Examples:"));
    assert!(!card.text().contains("Ancestors:"));
    assert!(card.text().contains("Relation: part of\n"));
    assert!(card.text().contains("Source types:\n"));
    assert!(card.text().contains("Target types:\n"));
    assert!(card.severely_truncated());
}

#[test]
fn linter_rejects_universal_and_adapter_supplied_identifiers() {
    for description in [
        "see https://example.com/types/entity-type/part-of/v/1",
        "database key 123e4567-e89b-12d3-a456-426614174000",
    ] {
        let input = RelationCardInput {
            description: Some(description),
            ..minimal_input()
        };
        assert!(render(input, CardBudgets::default()).is_err());
    }

    let input = RelationCardInput {
        description: Some("source property P361"),
        ..minimal_input()
    };
    assert!(matches!(
        build_card(
            input,
            CardBudgets::default(),
            &HeuristicTokenCounter,
            &NaiveSentenceSplitter,
            &["P361"],
        ),
        Err(CardError::ForbiddenIdentifier { identifier }) if identifier == "P361"
    ));

    let ordinary = RelationCardInput {
        title: "P2P relation",
        description: Some("The Audi Q5 and release 123e4567-e89b are ordinary prose."),
        ..minimal_input()
    };
    assert!(render(ordinary, CardBudgets::default()).is_ok());
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

#[test]
fn budgets_reject_inverted_or_empty_ranges() {
    assert!(matches!(
        CardBudgets::new(0, 7_500),
        Err(CardError::InvalidBudgets {
            target: 0,
            hard: 7_500
        })
    ));
    assert!(matches!(
        CardBudgets::new(7_501, 7_500),
        Err(CardError::InvalidBudgets {
            target: 7_501,
            hard: 7_500
        })
    ));
}

fn render(
    input: RelationCardInput<'_>,
    budgets: CardBudgets,
) -> Result<super::RelationCard, CardError> {
    build_card(
        input,
        budgets,
        &HeuristicTokenCounter,
        &NaiveSentenceSplitter,
        &[],
    )
}

fn canonical_input() -> RelationCardInput<'static> {
    RelationCardInput {
        language: "en",
        title: "part of",
        description: Some("this item is a part of that item"),
        aliases: &ALIASES,
        inverse: Some(PhraseInput {
            label: "has part",
            description: Some("this item has the listed part"),
        }),
        ancestors: &ANCESTORS,
        source_types: &SOURCE_TYPES,
        target_types: &TARGET_TYPES,
        constraints: RelationConstraints {
            symmetric: Some(false),
            transitive: Some(true),
            single_value: Some(false),
            distinct_values: Some(false),
            direction: RelationDirection::SourceToTarget,
        },
        examples: &EXAMPLES,
        slug: None,
    }
}

fn minimal_input() -> RelationCardInput<'static> {
    RelationCardInput {
        language: "en",
        title: "related to",
        description: None,
        aliases: &[],
        inverse: None,
        ancestors: &[],
        source_types: &[],
        target_types: &[],
        constraints: RelationConstraints {
            symmetric: None,
            transitive: None,
            single_value: None,
            distinct_values: None,
            direction: RelationDirection::SourceToTarget,
        },
        examples: &[],
        slug: None,
    }
}
