use alloc::{
    borrow::ToOwned as _,
    collections::BTreeMap,
    string::{String, ToString as _},
    vec,
    vec::Vec,
};
use core::{fmt::Debug, str::FromStr};

use type_system::ontology::VersionedUrl;

use crate::{
    Accessor, Action, BranchStep, Coverage, Definition, DefinitionParts, EntityPipeline,
    EntitySink, IssueKind, LinkEndpoint, LinkInput, LinkPipeline, LinkStep, PrimaryKey, Source,
    SourceKind, SourceName, SqlQuery, Step, StepKind, UnitMap,
};

const TYPES: &str = "https://example.test/@demo/types";

fn parse<T>(value: &str) -> T
where
    T: FromStr<Err: Debug>,
{
    T::from_str(value).expect("test values should be valid")
}

fn url(path: &str) -> VersionedUrl {
    parse(&format!("{TYPES}/{path}"))
}

fn query(text: &str) -> SqlQuery {
    SqlQuery::try_from(text.to_owned()).expect("test queries should not be empty")
}

fn sql_source(key: &str) -> Source {
    Source {
        kind: SourceKind::Sql {
            query: query("SELECT 1"),
            primary_key: PrimaryKey::new([parse(key)]).expect("test keys should be valid"),
        },
        coverage: Coverage::Complete,
    }
}

fn step(id: &str, action: Action) -> Step {
    Step {
        id: parse(id),
        kind: StepKind::Action(action),
    }
}

fn sink(entity_type: &str, entity_id: &str, properties: Vec<(&str, Accessor)>) -> Action {
    Action::Sink(EntitySink {
        entity_type: url(entity_type),
        entity_id: parse(entity_id),
        properties: properties
            .into_iter()
            .map(|(property_type, accessor)| (url(property_type), accessor))
            .collect(),
    })
}

fn column(name: &str) -> Accessor {
    Accessor::Column(parse(name))
}

/// A valid definition with two entity pipelines, declared in the reverse of their run order,
/// and one link pipeline.
fn aviation() -> DefinitionParts {
    DefinitionParts {
        connector: parse("aviation"),
        sources: BTreeMap::from([
            (parse("aircraft"), sql_source("TAIL")),
            (parse("airfields"), sql_source("ICAO")),
        ]),
        unit_maps: BTreeMap::from([(
            parse("masses"),
            UnitMap {
                units: BTreeMap::from([(parse("KG"), url("data-type/kilogram/v/1"))]),
                fallback: Some(url("data-type/mass/v/1")),
            },
        )]),
        entity_pipelines: vec![
            EntityPipeline {
                source: parse("aircraft"),
                depends_on: vec![parse("airfields")],
                inputs: BTreeMap::new(),
                steps: vec![
                    step("shape-aircraft", Action::Sql(query("SELECT * FROM input"))),
                    step(
                        "sink-aircraft",
                        sink(
                            "entity-type/aircraft/v/1",
                            "TAIL",
                            vec![
                                ("property-type/model/v/1", column("MODEL")),
                                (
                                    "property-type/empty-mass/v/1",
                                    Accessor::Measure {
                                        amount: parse("EMPTY_MASS"),
                                        unit: parse("MASS_UNIT"),
                                        unit_map: parse("masses"),
                                    },
                                ),
                            ],
                        ),
                    ),
                    step(
                        "cp-aircraft",
                        Action::Checkpoint(parse("aviation/aircraft")),
                    ),
                ],
            },
            EntityPipeline {
                source: parse("airfields"),
                depends_on: vec![],
                inputs: BTreeMap::new(),
                steps: vec![
                    step(
                        "sink-airfields",
                        sink(
                            "entity-type/airfield/v/1",
                            "ICAO",
                            vec![("property-type/name/v/1", column("FIELD_NAME"))],
                        ),
                    ),
                    step(
                        "cp-airfields",
                        Action::Checkpoint(parse("aviation/airfields")),
                    ),
                ],
            },
        ],
        link_pipelines: vec![LinkPipeline {
            id: parse("aircraft-based-at"),
            input: LinkInput::Checkpoint(parse("aviation/aircraft")),
            steps: vec![],
            from: LinkEndpoint {
                entity_type: url("entity-type/aircraft/v/1"),
                column: parse("TAIL"),
            },
            to: LinkEndpoint {
                entity_type: url("entity-type/airfield/v/1"),
                column: parse("HOME_BASE"),
            },
            link_type: url("entity-type/based-at/v/1"),
            properties: BTreeMap::new(),
        }],
    }
}

fn run_order(definition: &Definition) -> Vec<String> {
    definition
        .entity_pipelines()
        .iter()
        .map(|pipeline| pipeline.source.to_string())
        .collect()
}

/// Returns each issue of `parts` as its printed path and kind.
fn issues(parts: DefinitionParts) -> Vec<(String, IssueKind)> {
    let report = Definition::new(parts).expect_err("the definition should have issues");
    report
        .current_contexts()
        .map(|issue| (issue.path.to_string(), issue.kind.clone()))
        .collect()
}

fn pipeline_mut<'parts>(
    parts: &'parts mut DefinitionParts,
    source: &str,
) -> &'parts mut EntityPipeline {
    let source: SourceName = parse(source);
    parts
        .entity_pipelines
        .iter_mut()
        .find(|pipeline| pipeline.source == source)
        .expect("the pipeline should exist")
}

#[test]
fn order_depends_on() {
    let definition = Definition::new(aviation()).expect("the definition should be valid");
    assert_eq!(
        run_order(&definition),
        ["airfields", "aircraft"],
        "a pipeline should run after the pipeline it depends on"
    );
}

#[test]
fn order_checkpoint_source() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "aircraft").depends_on.clear();
    parts.sources.insert(
        parse("aircraft"),
        Source {
            kind: SourceKind::Checkpoint {
                checkpoint: parse("aviation/airfields"),
            },
            coverage: Coverage::Partial,
        },
    );
    parts.link_pipelines.clear();
    pipeline_mut(&mut parts, "aircraft").steps.pop();

    let definition = Definition::new(parts).expect("the definition should be valid");
    assert_eq!(
        run_order(&definition),
        ["airfields", "aircraft"],
        "a pipeline should run after the pipeline that produces its source's checkpoint"
    );
}

#[test]
fn order_input() {
    let mut parts = aviation();
    let aircraft = pipeline_mut(&mut parts, "aircraft");
    aircraft.depends_on.clear();
    aircraft
        .inputs
        .insert(parse("airfields"), parse("aviation/airfields"));

    let definition = Definition::new(parts).expect("the definition should be valid");
    assert_eq!(
        run_order(&definition),
        ["airfields", "aircraft"],
        "a pipeline should run after the pipeline that produces a checkpoint it reads"
    );
}

#[test]
fn undeclared_source() {
    let mut parts = aviation();
    parts.sources.remove(&parse::<SourceName>("airfields"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[1].source".to_owned(),
            IssueKind::UndeclaredSource {
                source: parse("airfields")
            }
        )],
        "a pipeline whose source is not declared should be reported at its `source`"
    );
}

#[test]
fn unused_source() {
    let mut parts = aviation();
    parts.sources.insert(parse("hangars"), sql_source("ID"));
    assert_eq!(
        issues(parts),
        [(
            "sources.hangars".to_owned(),
            IssueKind::UnusedSource {
                source: parse("hangars")
            }
        )],
        "a declared source without a pipeline should be reported"
    );
}

#[test]
fn duplicate_pipeline() {
    let mut parts = aviation();
    parts.entity_pipelines.push(EntityPipeline {
        source: parse("airfields"),
        depends_on: vec![],
        inputs: BTreeMap::new(),
        steps: vec![],
    });
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[2].source".to_owned(),
            IssueKind::DuplicatePipeline {
                source: parse("airfields")
            }
        )],
        "a second pipeline for the same source should be reported"
    );
}

#[test]
fn unknown_pipeline() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "aircraft")
        .depends_on
        .push(parse("hangars"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[0].dependsOn[1]".to_owned(),
            IssueKind::UnknownPipeline {
                source: parse("hangars")
            }
        )],
        "depending on a source without a pipeline should be reported"
    );
}

#[test]
fn depends_on_itself() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "airfields")
        .depends_on
        .push(parse("airfields"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[1].dependsOn[0]".to_owned(),
            IssueKind::DependsOnItself
        )],
        "a pipeline that depends on its own source should be reported"
    );
}

#[test]
fn dependency_cycle() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "airfields")
        .inputs
        .insert(parse("aircraft"), parse("aviation/aircraft"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities".to_owned(),
            IssueKind::DependencyCycle {
                pipelines: vec![parse("aircraft"), parse("airfields")]
            }
        )],
        "both pipelines in the cycle should be reported, in declaration order"
    );
}

#[test]
fn duplicate_step() {
    let mut parts = aviation();
    parts
        .link_pipelines
        .first_mut()
        .expect("the link pipeline should exist")
        .steps
        .push(LinkStep {
            id: parse("sink-airfields"),
            query: query("SELECT * FROM input"),
        });
    assert_eq!(
        issues(parts),
        [(
            "pipelines.links[0].steps[0].id".to_owned(),
            IssueKind::DuplicateStep {
                step: parse("sink-airfields")
            }
        )],
        "step IDs should be unique across entity and link pipelines"
    );
}

#[test]
fn duplicate_checkpoint() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "airfields").steps.push(Step {
        id: parse("fan-out"),
        kind: StepKind::Branch(vec![vec![BranchStep {
            id: parse("cp-again"),
            action: Action::Checkpoint(parse("aviation/aircraft")),
        }]]),
    });
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[1].steps[2].branches[0][0].checkpoint".to_owned(),
            IssueKind::DuplicateCheckpoint {
                checkpoint: parse("aviation/aircraft")
            }
        )],
        "a checkpoint produced inside a branch should count as produced"
    );
}

#[test]
fn unknown_checkpoint() {
    let mut parts = aviation();
    parts
        .link_pipelines
        .first_mut()
        .expect("the link pipeline should exist")
        .input = LinkInput::Checkpoint(parse("aviation/hangars"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.links[0].checkpoint".to_owned(),
            IssueKind::UnknownCheckpoint {
                checkpoint: parse("aviation/hangars")
            }
        )],
        "a link that reads a checkpoint no step produces should be reported"
    );
}

#[test]
fn reads_own_checkpoint() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "airfields")
        .inputs
        .insert(parse("previous"), parse("aviation/airfields"));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[1].inputs.previous".to_owned(),
            IssueKind::ReadsOwnCheckpoint {
                checkpoint: parse("aviation/airfields")
            }
        )],
        "a pipeline that reads its own checkpoint should be reported"
    );
}

#[test]
fn unknown_unit_map() {
    let mut parts = aviation();
    parts.unit_maps.clear();
    assert_eq!(
        issues(parts),
        [(
            format!(
                r#"pipelines.entities[0].steps[1].properties["{TYPES}/property-type/empty-mass/v/1"]"#
            ),
            IssueKind::UnknownUnitMap {
                unit_map: parse("masses")
            }
        )],
        "a measure that names an undeclared unit map should be reported at its property"
    );
}

#[test]
fn empty_unit_map() {
    let mut parts = aviation();
    parts.unit_maps.insert(
        parse("lengths"),
        UnitMap {
            units: BTreeMap::new(),
            fallback: None,
        },
    );
    assert_eq!(
        issues(parts),
        [("unitMaps.lengths".to_owned(), IssueKind::EmptyUnitMap)],
        "a unit map without units or a fallback should be reported"
    );
}

#[test]
fn empty_branch() {
    let mut parts = aviation();
    pipeline_mut(&mut parts, "airfields").steps.push(Step {
        id: parse("fan-out"),
        kind: StepKind::Branch(vec![vec![]]),
    });
    assert_eq!(
        issues(parts),
        [(
            "pipelines.entities[1].steps[2].branches[0]".to_owned(),
            IssueKind::EmptyBranch
        )],
        "a branch without steps should be reported"
    );
}

#[test]
fn inputs_empty() {
    let mut parts = aviation();
    parts
        .link_pipelines
        .first_mut()
        .expect("the link pipeline should exist")
        .input = LinkInput::Inputs(BTreeMap::new());
    assert_eq!(
        issues(parts),
        [(
            "pipelines.links[0].inputs".to_owned(),
            IssueKind::EmptyInputs
        )],
        "a link without input checkpoints should be reported"
    );
}

#[test]
fn inputs_uncombined() {
    let mut parts = aviation();
    parts
        .link_pipelines
        .first_mut()
        .expect("the link pipeline should exist")
        .input = LinkInput::Inputs(BTreeMap::from([
        (parse("aircraft"), parse("aviation/aircraft")),
        (parse("airfields"), parse("aviation/airfields")),
    ]));
    assert_eq!(
        issues(parts),
        [(
            "pipelines.links[0].inputs".to_owned(),
            IssueKind::UncombinedInputs
        )],
        "a link that reads several checkpoints without a step should be reported"
    );
}

#[test]
fn conflicting_property_versions() {
    let mut parts = aviation();
    let Some(Step {
        kind: StepKind::Action(Action::Sink(sink)),
        ..
    }) = pipeline_mut(&mut parts, "airfields").steps.first_mut()
    else {
        panic!("the first airfields step should be a sink");
    };
    sink.properties
        .insert(url("property-type/name/v/2"), column("FIELD_NAME"));
    assert_eq!(
        issues(parts),
        [(
            format!(
                r#"pipelines.entities[1].steps[0].properties["{TYPES}/property-type/name/v/2"]"#
            ),
            IssueKind::ConflictingPropertyVersions {
                first: url("property-type/name/v/1"),
                second: url("property-type/name/v/2"),
            }
        )],
        "two versions of one property type should be reported at the later one"
    );
}

#[test]
fn duplicate_link() {
    let mut parts = aviation();
    let link = parts
        .link_pipelines
        .first()
        .expect("the link pipeline should exist")
        .clone();
    parts.link_pipelines.push(link);
    assert_eq!(
        issues(parts),
        [(
            "pipelines.links[1].id".to_owned(),
            IssueKind::DuplicateLink {
                link: parse("aircraft-based-at")
            }
        )],
        "a repeated link ID should be reported at the second link"
    );
}

#[test]
fn issues_all_reported() {
    let mut parts = aviation();
    parts.sources.insert(parse("hangars"), sql_source("ID"));
    parts.unit_maps.clear();
    parts
        .link_pipelines
        .first_mut()
        .expect("the link pipeline should exist")
        .input = LinkInput::Checkpoint(parse("aviation/hangars"));

    let mut paths: Vec<_> = issues(parts).into_iter().map(|(path, _)| path).collect();
    paths.sort();
    assert_eq!(
        paths,
        [
            format!(
                r#"pipelines.entities[0].steps[1].properties["{TYPES}/property-type/empty-mass/v/1"]"#
            ),
            "pipelines.links[0].checkpoint".to_owned(),
            "sources.hangars".to_owned(),
        ],
        "unrelated issues should all be reported, not only the first"
    );
}
