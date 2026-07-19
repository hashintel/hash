//! Fixture tests for the HASH fact-to-contents projection.
//!
//! Every fixture is a set of adapter input rows; assertions inspect the
//! assembled contents or, for the golden test, the fully rendered card
//! text byte-for-byte.

use std::collections::HashSet;

use super::{EndpointAssociation, ExampleRow, TypeFacts, TypePhrase, build_contents};
use crate::dataset::card::{
    CardContext, CardsConfig, UnicodeSegmenter, build_card, contents::CardContents,
    token::HeuristicTokenizer,
};

const RELATION_ID: &str = "https://example.com/@acme/types/entity-type/owns/";
const PERSON_ID: &str = "https://example.com/@acme/types/entity-type/person/";
const EMPLOYEE_ID: &str = "https://example.com/@acme/types/entity-type/employee/";
const ORGANIZATION_ID: &str = "https://example.com/@acme/types/entity-type/organization/";
const ASSET_ID: &str = "https://example.com/@acme/types/entity-type/asset/";
const DIRECT_A: &str = "https://example.com/@acme/types/entity-type/person-a/";
const DIRECT_B: &str = "https://example.com/@acme/types/entity-type/person-b/";

fn context() -> CardContext<UnicodeSegmenter, HeuristicTokenizer> {
    CardContext {
        language: "en",
        segmenter: UnicodeSegmenter,
        tokenizer: HeuristicTokenizer,
    }
}

fn facts() -> TypeFacts<'static> {
    TypeFacts {
        id: RELATION_ID,
        title: "Owns",
        description: Some("Possession from an owner to an asset."),
        inverse_title: Some("Owned By"),
        ancestors: Vec::new(),
    }
}

fn person_association() -> EndpointAssociation<'static> {
    EndpointAssociation {
        source_id: PERSON_ID,
        source: TypePhrase {
            title: "Person",
            description: Some("A human being."),
        },
        targets: vec![TypePhrase {
            title: "Asset",
            description: Some("Something that can be owned."),
        }],
        minimum_targets: None,
        maximum_targets: Some(1),
    }
}

fn organization_association() -> EndpointAssociation<'static> {
    EndpointAssociation {
        source_id: ORGANIZATION_ID,
        source: TypePhrase {
            title: "Organization",
            description: None,
        },
        targets: vec![TypePhrase {
            title: "Organization",
            description: None,
        }],
        minimum_targets: None,
        maximum_targets: Some(1),
    }
}

fn association(
    source_id: &'static str,
    title: &'static str,
    targets: &[&'static str],
) -> EndpointAssociation<'static> {
    EndpointAssociation {
        source_id,
        source: TypePhrase {
            title,
            description: None,
        },
        targets: targets
            .iter()
            .map(|&title| TypePhrase {
                title,
                description: None,
            })
            .collect(),
        minimum_targets: None,
        maximum_targets: None,
    }
}

fn example_row(
    link_id: &'static str,
    source_id: &'static str,
    target_id: &'static str,
    source_label: &'static str,
    target_label: &'static str,
) -> ExampleRow<'static> {
    ExampleRow {
        link_id,
        source_id,
        target_id,
        source_label,
        target_label,
        source_direct_type: PERSON_ID,
        source_type_closure: vec![PERSON_ID],
        source_frequency: 1,
        target_frequency: 1,
    }
}

fn build(
    facts: TypeFacts<'static>,
    associations: Vec<EndpointAssociation<'static>>,
    examples: Vec<ExampleRow<'static>>,
    example_count: usize,
) -> CardContents<'static> {
    build_contents(facts, associations, examples, example_count, &context())
        .unwrap_or_else(|never| never)
        .expect("fixture inputs satisfy the association contract")
}

fn example_lines(contents: &CardContents<'static>) -> Vec<String> {
    contents.examples.iter().map(ToString::to_string).collect()
}

#[test]
fn endpoint_constraints_sort_sources_and_targets_by_casefolded_title() {
    let contents = build(
        facts(),
        vec![
            association(
                "https://example.com/@acme/types/entity-type/beta/",
                "Beta",
                &["Omega", "alpha", "Beta"],
            ),
            association(
                "https://example.com/@acme/types/entity-type/z-depot/",
                "Depot",
                &["Zebra"],
            ),
            association(
                "https://example.com/@acme/types/entity-type/acme/",
                "acme",
                &[],
            ),
            association(
                "https://example.com/@acme/types/entity-type/a-depot/",
                "Depot",
                &["Anvil"],
            ),
        ],
        Vec::new(),
        0,
    );

    let shapes: Vec<(&str, Vec<&str>)> = contents
        .endpoint_constraints
        .iter()
        .map(|constraint| {
            (
                constraint.source.label.as_ref(),
                constraint
                    .targets
                    .iter()
                    .map(|target| target.label.as_ref())
                    .collect(),
            )
        })
        .collect();

    assert_eq!(
        shapes,
        [
            ("acme", vec![]),
            ("Beta", vec!["alpha", "Beta", "Omega"]),
            ("Depot", vec!["Anvil"]),
            ("Depot", vec!["Zebra"]),
        ]
    );
}

#[test]
fn single_value_requires_every_association_to_cap_targets_at_one() {
    let unconstrained = build(facts(), Vec::new(), Vec::new(), 2);
    assert_eq!(unconstrained.constraints.singleton, None);

    let capped = build(
        facts(),
        vec![person_association(), organization_association()],
        Vec::new(),
        2,
    );
    assert_eq!(capped.constraints.singleton, Some(true));

    let multiple = build(
        facts(),
        vec![
            person_association(),
            EndpointAssociation {
                maximum_targets: Some(2),
                ..organization_association()
            },
        ],
        Vec::new(),
        2,
    );
    assert_eq!(multiple.constraints.singleton, Some(false));

    let unbounded = build(
        facts(),
        vec![
            person_association(),
            EndpointAssociation {
                maximum_targets: None,
                ..organization_association()
            },
        ],
        Vec::new(),
        2,
    );
    assert_eq!(unbounded.constraints.singleton, Some(false));
}

fn contested_row(
    link_id: &'static str,
    source_id: &'static str,
    target_id: &'static str,
    source_label: &'static str,
    target_label: &'static str,
    direct: &'static str,
) -> ExampleRow<'static> {
    ExampleRow {
        source_direct_type: direct,
        source_type_closure: vec![direct, PERSON_ID],
        ..example_row(link_id, source_id, target_id, source_label, target_label)
    }
}

fn contested_rows() -> Vec<ExampleRow<'static>> {
    vec![
        contested_row(
            "web/link-0",
            "web/shared",
            "web/object-0",
            "Shared",
            "Object 0",
            DIRECT_A,
        ),
        contested_row(
            "web/link-1",
            "web/shared",
            "web/object-1",
            "Shared",
            "Object 1",
            DIRECT_B,
        ),
        contested_row(
            "web/link-2",
            "web/source-2",
            "web/object-2",
            "Source 2",
            "Object 2",
            DIRECT_A,
        ),
        contested_row(
            "web/link-3",
            "web/source-3",
            "web/object-3",
            "Source 3",
            "Object 3",
            DIRECT_B,
        ),
        contested_row(
            "web/link-4",
            "web/source-4",
            "web/object-4",
            "Source 4",
            "Object 4",
            DIRECT_A,
        ),
    ]
}

#[test]
fn examples_are_endpoint_deduplicated_bounded_and_input_order_independent() {
    // Five candidates, two sharing a source endpoint: only four can
    // coexist, however many slots the budget offers.
    let unbounded = build(facts(), vec![person_association()], contested_rows(), 5);
    assert_eq!(unbounded.examples.len(), 4);
    let shared_lines = example_lines(&unbounded)
        .iter()
        .filter(|line| line.contains("Shared"))
        .count();
    assert_eq!(shared_lines, 1);

    let bounded = build(facts(), vec![person_association()], contested_rows(), 3);
    assert_eq!(bounded.examples.len(), 3);

    let mut reversed_rows = contested_rows();
    reversed_rows.reverse();
    let reversed = build(facts(), vec![person_association()], reversed_rows, 5);
    assert_eq!(reversed.to_string(), unbounded.to_string());
}

#[test]
fn frequency_ranking_prefers_recognizable_normalized_labels() {
    let rows = vec![
        example_row(
            "web/link-rare",
            "web/rare-source",
            "web/rare-target",
            "Purchase order",
            "Nissei Corporation",
        ),
        ExampleRow {
            source_frequency: 20,
            target_frequency: 30,
            ..example_row(
                "web/link-known",
                "web/known-source",
                "web/known-target",
                "  Purchase   order  ",
                "  Nissei   Corporation  ",
            )
        },
        ExampleRow {
            source_frequency: 2,
            target_frequency: 3,
            ..example_row(
                "web/link-other",
                "web/other-source",
                "web/other-target",
                "Other purchase order",
                "Tanaka Kikinzoku Kogyo",
            )
        },
    ];

    let contents = build(facts(), vec![person_association()], rows, 3);

    // The frequent pair leads; the rare candidate loses its slot because
    // its whitespace-normalized labels render the same line.
    assert_eq!(
        example_lines(&contents),
        [
            "Person: Purchase order -> Nissei Corporation",
            "Person: Other purchase order -> Tanaka Kikinzoku Kogyo",
        ]
    );
}

#[test]
fn rendered_pair_conflicts_drop_duplicate_text_but_keep_alternates() {
    let rows = vec![
        example_row(
            "web-a/link-leaf",
            "web-a/leaf",
            "web-a/middle",
            "Leaf",
            "Middle",
        ),
        example_row(
            "web-b/link-leaf",
            "web-b/leaf",
            "web-b/middle",
            "Leaf",
            "Middle",
        ),
        example_row(
            "web-a/link-middle",
            "web-a/middle",
            "web-a/first",
            "Middle",
            "First",
        ),
        example_row(
            "web-b/link-middle",
            "web-b/middle",
            "web-b/first",
            "Middle",
            "First",
        ),
    ];

    let contents = build(facts(), vec![person_association()], rows, 4);

    let lines: HashSet<String> = example_lines(&contents).into_iter().collect();
    assert_eq!(
        lines,
        HashSet::from([
            "Person: Leaf -> Middle".to_owned(),
            "Person: Middle -> First".to_owned(),
        ])
    );
}

#[test]
fn stratification_uses_nearest_closure_entry_despite_title_collisions() {
    let employee_association = EndpointAssociation {
        source_id: EMPLOYEE_ID,
        source: TypePhrase {
            title: "Person",
            description: None,
        },
        targets: Vec::new(),
        minimum_targets: None,
        maximum_targets: Some(1),
    };
    let person_alias_association = EndpointAssociation {
        source_id: PERSON_ID,
        source: TypePhrase {
            title: "Person",
            description: None,
        },
        targets: Vec::new(),
        minimum_targets: None,
        maximum_targets: Some(1),
    };
    let rows = vec![
        // The nearest closure entry is the person type, so this candidate
        // belongs to the later group despite its stronger recognizability.
        ExampleRow {
            source_type_closure: vec![PERSON_ID, EMPLOYEE_ID],
            source_frequency: 50,
            target_frequency: 50,
            ..example_row(
                "web/link-impostor",
                "web/impostor",
                "web/gadget",
                "Impostor",
                "Gadget",
            )
        },
        ExampleRow {
            source_direct_type: EMPLOYEE_ID,
            source_type_closure: vec![EMPLOYEE_ID],
            ..example_row(
                "web/link-alice",
                "web/alice",
                "web/laptop",
                "Alice",
                "Laptop",
            )
        },
    ];

    let contents = build(
        facts(),
        vec![person_alias_association, employee_association],
        rows,
        1,
    );

    // The lone slot belongs to the first group: the employee type, whose
    // id orders before the person type under the identical title.
    assert_eq!(example_lines(&contents), ["Person: Alice -> Laptop"]);
}

#[test]
fn unmatched_candidates_fall_back_only_when_every_source_group_is_empty() {
    let matched = || example_row("web/link-alice", "web/alice", "web/car", "Alice", "Car");
    let unmatched = || ExampleRow {
        source_direct_type: ASSET_ID,
        source_type_closure: vec![ASSET_ID],
        ..example_row(
            "web/link-odd",
            "web/odd",
            "web/asset",
            "Unexpected source",
            "Asset",
        )
    };

    let guarded = build(
        facts(),
        vec![person_association()],
        vec![matched(), unmatched()],
        2,
    );
    assert_eq!(example_lines(&guarded), ["Person: Alice -> Car"]);

    let fallback = build(facts(), vec![person_association()], vec![unmatched()], 2);
    assert_eq!(example_lines(&fallback), ["Unexpected source -> Asset"]);
    assert!(fallback.examples[0].group.is_none());

    let ungrouped = build(facts(), Vec::new(), vec![matched(), unmatched()], 2);
    assert_eq!(ungrouped.examples.len(), 2);
    assert!(
        ungrouped
            .examples
            .iter()
            .all(|example| example.group.is_none())
    );
}

#[test]
fn slug_takes_the_last_path_segment_ignoring_trailing_slashes() {
    for id in [
        "https://example.com/@acme/types/entity-type/owns/",
        "https://example.com/@acme/types/entity-type/owns",
        "https://example.com/@acme/types/entity-type/owns///",
    ] {
        let contents = build(TypeFacts { id, ..facts() }, Vec::new(), Vec::new(), 0);
        assert_eq!(contents.epilogue.slug, "owns");
    }
}

#[test]
fn association_outside_its_contract_yields_no_contents() {
    let inverted = build_contents(
        facts(),
        vec![EndpointAssociation {
            minimum_targets: Some(2),
            maximum_targets: Some(1),
            ..person_association()
        }],
        Vec::new(),
        2,
        &context(),
    )
    .unwrap_or_else(|never| never);
    assert!(inverted.is_none());

    let unlabelled = build_contents(
        facts(),
        vec![EndpointAssociation {
            source: TypePhrase {
                title: "   ",
                description: None,
            },
            ..person_association()
        }],
        Vec::new(),
        2,
        &context(),
    )
    .unwrap_or_else(|never| never);
    assert!(unlabelled.is_none());
}

#[test]
fn assembled_contents_render_the_canonical_card() {
    let contents = build(
        TypeFacts {
            ancestors: vec![TypePhrase {
                title: "Related To",
                description: None,
            }],
            ..facts()
        },
        vec![person_association(), organization_association()],
        vec![
            example_row("web/link-a", "web/alice", "web/car", "Alice", "Car"),
            ExampleRow {
                source_direct_type: ORGANIZATION_ID,
                source_type_closure: vec![ORGANIZATION_ID],
                ..example_row("web/link-b", "web/acme", "web/hq", "Acme", "Headquarters")
            },
        ],
        2,
    );

    let card = build_card(contents, CardsConfig::default(), &HeuristicTokenizer, &[])
        .expect("the assembled contents render under the default budgets");

    assert_eq!(
        card.card_text(),
        concat!(
            "Relation: Owns\n",
            "Description: Possession from an owner to an asset.\n",
            "Inverse Name: Owned By\n\n",
            "Ancestors:\n",
            "  - Related To\n\n",
            "Endpoint constraints:\n",
            "  - Organization -> Organization [targets per source: <= 1]\n",
            "  - Person (A human being.) -> Asset (Something that can be owned.) ",
            "[targets per source: <= 1]\n\n",
            "Constraints:\n",
            "  - symmetric? not recorded\n",
            "  - transitive? not recorded\n",
            "  - single value? yes\n",
            "  - distinct values? not recorded\n",
            "  - direction: source -> target\n\n",
            "Examples:\n",
            "  - Organization: Acme -> Headquarters\n",
            "  - Person: Alice -> Car\n\n",
            "Slug: owns\n",
        )
    );
    assert!(card.truncations().is_empty());
    assert!(!card.severely_truncated());
}
