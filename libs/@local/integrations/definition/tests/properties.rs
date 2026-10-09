//! Property tests for [`Definition::from_yaml`].
//!
//! The tests generate valid definitions, write them as YAML, and check that the text parses to the
//! definition built directly from the same parts. Mutations change one part so that parsing must
//! report exactly one issue.

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{fmt::Write as _, str::FromStr};

use error_stack::Report;
use hash_integrations_definition::{
    Accessor, Action, BranchStep, Branches, Coercion, Coverage, Definition, DefinitionIssue,
    DefinitionParts, EntityPipeline, EntitySink, IssueKind, LinkEndpoint, LinkInput, LinkPipeline,
    ParseError, PrimaryKey, Properties, Source, SourceKind, SqlQuery, Step, StepKind, UnitMap,
};
use proptest::{prelude::*, sample::Index};
use serde_saphyr::budget::BudgetBreach;
use type_system::ontology::VersionedUrl;

const TYPES: &str = "https://example.com/@demo/types";

const COERCIONS: &[(&str, Coercion)] = &[
    ("date", Coercion::Date),
    ("time", Coercion::Time),
    ("boolean", Coercion::Boolean),
    ("number", Coercion::Number),
    ("integer", Coercion::Integer),
    ("year", Coercion::Year),
    ("trim", Coercion::Trim),
];

const COVERAGES: &[(&str, Coverage)] = &[
    ("partial", Coverage::Partial),
    ("complete", Coverage::Complete),
    ("complete-or-empty", Coverage::CompleteOrEmpty),
];

fn parse<T: FromStr<Err: core::fmt::Debug>>(text: &str) -> T {
    T::from_str(text).expect("document values should be valid")
}

/// A column name that can need quoting in YAML. It can contain `${`, which must be escaped.
fn column() -> impl Strategy<Value = String> {
    "[A-Za-z0-9 _:#'\"${}-]{1,10}"
}

#[derive(Debug, Clone)]
enum AccessorDoc {
    Column(String),
    Coerce(String, (&'static str, Coercion)),
    Measure(String, String),
}

#[derive(Debug, Clone)]
enum ActionDoc {
    Sql(String),
    Checkpoint(String),
    Sink(Vec<(String, AccessorDoc)>),
}

#[derive(Debug, Clone)]
enum StepKindDoc {
    Action(ActionDoc),
    Branch(Vec<Vec<(String, ActionDoc)>>),
}

#[derive(Debug, Clone)]
struct StepDoc {
    id: String,
    kind: StepKindDoc,
}

#[derive(Debug, Clone)]
struct SourceDoc {
    name: String,
    sql: String,
    primary_key: String,
    coverage: Option<(&'static str, Coverage)>,
}

#[derive(Debug, Clone)]
struct PipelineDoc {
    source: String,
    depends_on: Vec<String>,
    steps: Vec<StepDoc>,
}

#[derive(Debug, Clone)]
struct LinkDoc {
    id: String,
    checkpoint: String,
}

/// A valid definition with concrete names.
#[derive(Debug, Clone)]
struct Document {
    use_vars: bool,
    sources: Vec<SourceDoc>,
    pipelines: Vec<PipelineDoc>,
    links: Vec<LinkDoc>,
}

/// Hands out unique step IDs, checkpoint names and property types.
#[derive(Default)]
struct Names {
    steps: usize,
    checkpoints: Vec<String>,
    properties: usize,
}

impl Names {
    fn step(&mut self) -> String {
        self.steps += 1;
        format!("step-{}", self.steps)
    }

    fn checkpoint(&mut self) -> String {
        let name = format!("demo/checkpoint-{}", self.checkpoints.len() + 1);
        self.checkpoints.push(name.clone());
        name
    }

    fn property(&mut self) -> String {
        self.properties += 1;
        format!("property-type/p{}/v/1", self.properties)
    }
}

/// The shape of an action before it is named.
#[derive(Debug, Clone)]
enum ActionShape {
    Sql(String),
    Checkpoint,
    Sink(Vec<AccessorDoc>),
}

impl ActionShape {
    fn name(self, names: &mut Names) -> ActionDoc {
        match self {
            Self::Sql(query) => ActionDoc::Sql(query),
            Self::Checkpoint => ActionDoc::Checkpoint(names.checkpoint()),
            Self::Sink(accessors) => ActionDoc::Sink(
                accessors
                    .into_iter()
                    .map(|accessor| (names.property(), accessor))
                    .collect(),
            ),
        }
    }
}

#[derive(Debug, Clone)]
enum StepShape {
    Action(ActionShape),
    Branch(Vec<Vec<ActionShape>>),
}

#[derive(Debug, Clone)]
struct PipelineShape {
    primary_key: String,
    coverage: Option<(&'static str, Coverage)>,
    depends_on: Vec<Index>,
    steps: Vec<StepShape>,
}

fn accessor() -> impl Strategy<Value = AccessorDoc> {
    prop_oneof![
        column().prop_map(AccessorDoc::Column),
        (column(), prop::sample::select(COERCIONS))
            .prop_map(|(column, coercion)| AccessorDoc::Coerce(column, coercion)),
        (column(), column()).prop_map(|(amount, unit)| AccessorDoc::Measure(amount, unit)),
    ]
}

fn action() -> impl Strategy<Value = ActionShape> {
    prop_oneof![
        "SELECT [a-z0-9 ,*]{0,20}".prop_map(ActionShape::Sql),
        Just(ActionShape::Checkpoint),
        prop::collection::vec(accessor(), 0..4).prop_map(ActionShape::Sink),
    ]
}

fn step() -> impl Strategy<Value = StepShape> {
    prop_oneof![
        4 => action().prop_map(StepShape::Action),
        1 => prop::collection::vec(prop::collection::vec(action(), 1..3), 1..3)
            .prop_map(StepShape::Branch),
    ]
}

fn pipeline() -> impl Strategy<Value = PipelineShape> {
    (
        column(),
        prop::option::of(prop::sample::select(COVERAGES)),
        prop::collection::vec(any::<Index>(), 0..3),
        prop::collection::vec(step(), 0..4),
    )
        .prop_map(|(primary_key, coverage, depends_on, steps)| PipelineShape {
            primary_key,
            coverage,
            depends_on,
            steps,
        })
}

/// Generates valid documents. A pipeline depends only on pipelines declared before it, and
/// links read only checkpoints that some step produces.
fn document() -> impl Strategy<Value = Document> {
    (
        any::<bool>(),
        prop::collection::vec(pipeline(), 1..4),
        prop::collection::vec(any::<Index>(), 0..3),
    )
        .prop_map(|(use_vars, shapes, links)| {
            let mut names = Names::default();
            let mut sources = Vec::new();
            let mut pipelines = Vec::new();

            for (position, shape) in shapes.into_iter().enumerate() {
                let source = format!("source-{position}");
                sources.push(SourceDoc {
                    name: source.clone(),
                    sql: format!("SELECT {position}"),
                    primary_key: shape.primary_key,
                    coverage: shape.coverage,
                });

                let mut depends_on: Vec<usize> = if position == 0 {
                    Vec::new()
                } else {
                    shape
                        .depends_on
                        .iter()
                        .map(|index| index.index(position))
                        .collect()
                };
                depends_on.sort_unstable();
                depends_on.dedup();

                let steps = shape
                    .steps
                    .into_iter()
                    .map(|step| {
                        let id = names.step();
                        let kind = match step {
                            StepShape::Action(action) => {
                                StepKindDoc::Action(action.name(&mut names))
                            }
                            StepShape::Branch(branches) => StepKindDoc::Branch(
                                branches
                                    .into_iter()
                                    .map(|branch| {
                                        branch
                                            .into_iter()
                                            .map(|action| (names.step(), action.name(&mut names)))
                                            .collect()
                                    })
                                    .collect(),
                            ),
                        };
                        StepDoc { id, kind }
                    })
                    .collect();

                pipelines.push(PipelineDoc {
                    source,
                    depends_on: depends_on
                        .into_iter()
                        .map(|dependency| format!("source-{dependency}"))
                        .collect(),
                    steps,
                });
            }

            let links = if names.checkpoints.is_empty() {
                Vec::new()
            } else {
                links
                    .iter()
                    .enumerate()
                    .map(|(position, index)| LinkDoc {
                        id: format!("link-{position}"),
                        checkpoint: index.get(&names.checkpoints).clone(),
                    })
                    .collect()
            };

            Document {
                use_vars,
                sources,
                pipelines,
                links,
            }
        })
}

/// Writes `text` as a double-quoted YAML string, leaving `${NAME}` placeholders for the parser to
/// replace.
fn quote_template(text: &str) -> String {
    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

/// Writes `text` as a double-quoted YAML string that parses back to `text`, escaping `${` as
/// `$${`.
fn quote(text: &str) -> String {
    quote_template(&text.replace("${", "$${"))
}

impl Document {
    fn written_url(&self, path: &str) -> String {
        if self.use_vars {
            format!("${{TYPES}}/{path}")
        } else {
            format!("{TYPES}/{path}")
        }
    }

    fn render_action(
        &self,
        text: &mut String,
        action: &ActionDoc,
        indent: &str,
    ) -> core::fmt::Result {
        match action {
            ActionDoc::Sql(query) => writeln!(text, "{indent}sql: {}", quote(query)),
            ActionDoc::Checkpoint(name) => writeln!(text, "{indent}checkpoint: {}", quote(name)),
            ActionDoc::Sink(properties) => {
                writeln!(text, "{indent}sink:")?;
                writeln!(
                    text,
                    "{indent}  entityType: {}",
                    quote_template(&self.written_url("entity-type/e/v/1"))
                )?;
                writeln!(text, "{indent}  entityId: \"id\"")?;
                if properties.is_empty() {
                    return writeln!(text, "{indent}  properties: {{}}");
                }
                writeln!(text, "{indent}  properties:")?;
                for (property, accessor) in properties {
                    let key = quote_template(&self.written_url(property));
                    match accessor {
                        AccessorDoc::Column(column) => {
                            writeln!(text, "{indent}    {key}: {}", quote(column))
                        }
                        AccessorDoc::Coerce(column, coercion) => writeln!(
                            text,
                            "{indent}    {key}: {{ column: {}, coerce: {} }}",
                            quote(column),
                            coercion.0
                        ),
                        AccessorDoc::Measure(amount, unit) => writeln!(
                            text,
                            "{indent}    {key}: {{ amount: {}, unit: {}, unitMap: masses }}",
                            quote(amount),
                            quote(unit)
                        ),
                    }?;
                }
                Ok(())
            }
        }
    }

    fn write(&self, text: &mut String) -> core::fmt::Result {
        writeln!(text, "connector: demo")?;
        writeln!(text, "vars:\n  TYPES: {}", quote(TYPES))?;
        writeln!(
            text,
            "unitMaps:\n  masses:\n    units:\n      KG: {}\n    fallback: {}",
            quote_template(&self.written_url("data-type/kilogram/v/1")),
            quote_template(&self.written_url("data-type/mass/v/1"))
        )?;

        writeln!(text, "sources:")?;
        for source in &self.sources {
            writeln!(text, "  {}:", source.name)?;
            writeln!(text, "    sql: {}", quote_template(&source.sql))?;
            writeln!(text, "    primaryKey: [{}]", quote(&source.primary_key))?;
            if let Some(coverage) = source.coverage {
                writeln!(text, "    coverage: {}", coverage.0)?;
            }
        }

        writeln!(text, "pipelines:\n  entities:")?;
        for pipeline in &self.pipelines {
            writeln!(text, "    - source: {}", pipeline.source)?;
            if !pipeline.depends_on.is_empty() {
                writeln!(
                    text,
                    "      dependsOn: [{}]",
                    pipeline.depends_on.join(", ")
                )?;
            }
            if pipeline.steps.is_empty() {
                writeln!(text, "      steps: []")?;
                continue;
            }
            writeln!(text, "      steps:")?;
            for step in &pipeline.steps {
                writeln!(text, "        - id: {}", quote(&step.id))?;
                match &step.kind {
                    StepKindDoc::Action(action) => {
                        self.render_action(text, action, "          ")?;
                    }
                    StepKindDoc::Branch(branches) => {
                        writeln!(text, "          branches:")?;
                        for branch in branches {
                            let mut marker = "            - -";
                            for (id, action) in branch {
                                writeln!(text, "{marker} id: {}", quote(id))?;
                                marker = "              -";
                                self.render_action(text, action, "                ")?;
                            }
                        }
                    }
                }
            }
        }

        if self.links.is_empty() {
            return writeln!(text, "  links: []");
        }
        writeln!(text, "  links:")?;
        for link in &self.links {
            writeln!(text, "    - id: {}", link.id)?;
            writeln!(text, "      checkpoint: {}", quote(&link.checkpoint))?;
            let from = quote_template(&self.written_url("entity-type/a/v/1"));
            let to = quote_template(&self.written_url("entity-type/b/v/1"));
            writeln!(text, "      from: {{ entityType: {from}, column: \"a\" }}")?;
            writeln!(text, "      to: {{ entityType: {to}, column: \"b\" }}")?;
            writeln!(
                text,
                "      linkType: {}",
                quote_template(&self.written_url("entity-type/a-to-b/v/1"))
            )?;
        }
        Ok(())
    }

    fn render(&self) -> String {
        let mut text = String::new();
        self.write(&mut text)
            .expect("writing to a string should succeed");
        text
    }

    fn url(path: &str) -> VersionedUrl {
        parse(&format!("{TYPES}/{path}"))
    }

    fn action(action: &ActionDoc) -> Action {
        match action {
            ActionDoc::Sql(query) => Action::Sql(
                SqlQuery::try_from(query.clone()).expect("document queries should not be empty"),
            ),
            ActionDoc::Checkpoint(name) => Action::Checkpoint(parse(name)),
            ActionDoc::Sink(properties) => Action::Sink(EntitySink {
                entity_type: Self::url("entity-type/e/v/1"),
                entity_id: parse("id"),
                properties: Properties::try_from(
                    properties
                        .iter()
                        .map(|(property, accessor)| {
                            let accessor = match accessor {
                                AccessorDoc::Column(column) => Accessor::Column(parse(column)),
                                AccessorDoc::Coerce(column, coercion) => Accessor::Coerce {
                                    column: parse(column),
                                    coercion: coercion.1,
                                },
                                AccessorDoc::Measure(amount, unit) => Accessor::Measure {
                                    amount: parse(amount),
                                    unit: parse(unit),
                                    unit_map: parse("masses"),
                                },
                            };
                            (Self::url(property), accessor)
                        })
                        .collect::<BTreeMap<_, _>>(),
                )
                .expect("document properties should not conflict"),
            }),
        }
    }

    /// Builds the definition this document describes, without parsing it.
    fn definition(&self) -> Definition {
        let parts = DefinitionParts {
            connector: parse("demo"),
            sources: self
                .sources
                .iter()
                .map(|source| {
                    let source_value = Source {
                        kind: SourceKind::Sql {
                            query: SqlQuery::try_from(source.sql.clone())
                                .expect("document queries should not be empty"),
                            primary_key: PrimaryKey::new([parse(&source.primary_key)])
                                .expect("a one-column key should be valid"),
                        },
                        coverage: source
                            .coverage
                            .map_or(Coverage::Complete, |coverage| coverage.1),
                    };
                    (parse(&source.name), source_value)
                })
                .collect(),
            unit_maps: BTreeMap::from([(
                parse("masses"),
                UnitMap::new(
                    BTreeMap::from([(parse("KG"), Self::url("data-type/kilogram/v/1"))]),
                    Some(Self::url("data-type/mass/v/1")),
                )
                .expect("the document unit map should not be empty"),
            )]),
            entity_pipelines: self
                .pipelines
                .iter()
                .map(|pipeline| EntityPipeline {
                    source: parse(&pipeline.source),
                    depends_on: pipeline
                        .depends_on
                        .iter()
                        .map(|source| parse(source))
                        .collect(),
                    inputs: BTreeMap::new(),
                    steps: pipeline
                        .steps
                        .iter()
                        .map(|step| Step {
                            id: parse(&step.id),
                            kind: match &step.kind {
                                StepKindDoc::Action(action) => {
                                    StepKind::Action(Self::action(action))
                                }
                                StepKindDoc::Branch(branches) => StepKind::Branch(
                                    Branches::new(branches.iter().map(|branch| {
                                        branch
                                            .iter()
                                            .map(|(id, action)| BranchStep {
                                                id: parse(id),
                                                action: Self::action(action),
                                            })
                                            .collect()
                                    }))
                                    .expect("document branches should not be empty"),
                                ),
                            },
                        })
                        .collect(),
                })
                .collect(),
            link_pipelines: self
                .links
                .iter()
                .map(|link| LinkPipeline {
                    id: parse(&link.id),
                    input: LinkInput::Checkpoint(parse(&link.checkpoint)),
                    steps: Vec::new(),
                    from: LinkEndpoint {
                        entity_type: Self::url("entity-type/a/v/1"),
                        column: parse("a"),
                    },
                    to: LinkEndpoint {
                        entity_type: Self::url("entity-type/b/v/1"),
                        column: parse("b"),
                    },
                    link_type: Self::url("entity-type/a-to-b/v/1"),
                    properties: Properties::default(),
                })
                .collect(),
        };

        Definition::new(parts).expect("generated documents should be valid")
    }
}

/// A change that gives a valid document exactly one issue.
#[derive(Debug, Clone, Copy)]
enum Mutation {
    UnknownDependency,
    UnknownLinkCheckpoint,
    DuplicateStepId,
    InvalidStepId,
    UnknownVariable,
}

impl Mutation {
    /// Applies the mutation, or returns `None` and leaves the document unchanged if it has
    /// nothing to change.
    ///
    /// Returns the text that marks the changed line, and which occurrence of it to look for.
    fn apply(self, document: &mut Document) -> Option<(String, usize)> {
        match self {
            Self::UnknownDependency => {
                document
                    .pipelines
                    .first_mut()?
                    .depends_on
                    .push("missing-source".to_owned());
                Some(("missing-source".to_owned(), 0))
            }
            Self::UnknownLinkCheckpoint => {
                "demo/missing".clone_into(&mut document.links.first_mut()?.checkpoint);
                Some(("demo/missing".to_owned(), 0))
            }
            Self::DuplicateStepId => {
                let mut steps = document
                    .pipelines
                    .iter_mut()
                    .flat_map(|pipeline| &mut pipeline.steps);
                let first = steps.next()?.id.clone();
                steps.last()?.id.clone_from(&first);
                Some((format!("id: {}", quote(&first)), 1))
            }
            Self::InvalidStepId => {
                let step = document
                    .pipelines
                    .iter_mut()
                    .flat_map(|pipeline| &mut pipeline.steps)
                    .next()?;
                "Bad Step".clone_into(&mut step.id);
                Some(("Bad Step".to_owned(), 0))
            }
            Self::UnknownVariable => {
                "SELECT ${MISSING}".clone_into(&mut document.sources.first_mut()?.sql);
                Some(("${MISSING}".to_owned(), 0))
            }
        }
    }

    const fn matches(self, kind: &IssueKind) -> bool {
        matches!(
            (self, kind),
            (Self::UnknownDependency, IssueKind::UnknownPipeline { .. })
                | (
                    Self::UnknownLinkCheckpoint,
                    IssueKind::UnknownCheckpoint { .. }
                )
                | (Self::DuplicateStepId, IssueKind::DuplicateStep { .. })
                | (Self::InvalidStepId, IssueKind::InvalidName { .. })
                | (Self::UnknownVariable, IssueKind::UnknownVariable { .. })
        )
    }
}

/// Mutations in the order they are tried. The last two apply to every document, because every
/// document has a pipeline and a source.
const MUTATIONS: &[Mutation] = &[
    Mutation::UnknownLinkCheckpoint,
    Mutation::DuplicateStepId,
    Mutation::InvalidStepId,
    Mutation::UnknownDependency,
    Mutation::UnknownVariable,
];

/// Returns the 1-based number of a line that contains `marker`.
///
/// `occurrence` picks which of those lines, counting from 0.
fn line_of(text: &str, marker: &str, occurrence: usize) -> Option<u64> {
    let (index, _) = text
        .lines()
        .enumerate()
        .filter(|(_, line)| line.contains(marker))
        .nth(occurrence)?;
    u64::try_from(index + 1).ok()
}

/// YAML-shaped fragments, so that random input reaches the format as well as the parser.
fn fragments() -> impl Strategy<Value = String> {
    prop::collection::vec(
        prop::sample::select(
            &[
                "connector: demo\n",
                "sources:\n",
                "  a:\n",
                "    sql: SELECT 1\n",
                "    primaryKey: [id]\n",
                "pipelines:\n",
                "  entities:\n",
                "    - source: a\n",
                "      steps:\n",
                "        - id: s\n",
                "          checkpoint: x/y\n",
                "  ",
                "- ",
                "{",
                "}",
                "[",
                "]",
                ": ",
                "\"",
                "${",
                "&anchor ",
                "*anchor",
                "\n",
                "\t",
                "#",
            ][..],
        ),
        0..40,
    )
    .prop_map(|parts| parts.concat())
}

proptest! {
    #[test]
    fn fragments_located_in_input(text in fragments()) {
        let Err(report) = Definition::from_yaml(&text) else {
            return Ok(());
        };
        let lines = u64::try_from(text.lines().count()).expect("line count should fit") + 1;
        let locations: Vec<_> = match report.current_context() {
            ParseError::Syntax { location } => location.iter().copied().collect(),
            ParseError::Invalid => DefinitionIssue::in_report(&report)
                .filter_map(DefinitionIssue::location)
                .collect(),
        };
        for location in locations {
            prop_assert!(
                location.line.get() <= lines,
                "location {location} should be inside the {lines}-line input"
            );
        }
    }

    #[test]
    fn valid_documents_round_trip(document in document()) {
        let text = document.render();
        let parsed = Definition::from_yaml(&text)
            .map_err(|report| {
                TestCaseError::fail(format!("the text should parse: {report:?}\n{text}"))
            })?;
        prop_assert_eq!(parsed, document.definition(), "the text should parse to the document");
    }

    #[test]
    fn mutation_reports_one_issue(mut document in document(), first in 0..MUTATIONS.len()) {
        let (mutation, (marker, occurrence)) = MUTATIONS
            .iter()
            .skip(first)
            .find_map(|&mutation| Some((mutation, mutation.apply(&mut document)?)))
            .expect("the last mutations should apply to every document");
        let text = document.render();
        let report = Definition::from_yaml(&text)
            .err()
            .ok_or_else(|| TestCaseError::fail(format!("{mutation:?} should make the text invalid\n{text}")))?;
        let issues: Vec<_> = DefinitionIssue::in_report(&report).collect();

        prop_assert_eq!(issues.len(), 1, "{:?} should cause exactly one issue: {:?}\n{}", mutation, issues, text);
        let issue = issues[0];
        prop_assert!(mutation.matches(issue.kind()), "{:?} should cause its own issue, not {}", mutation, issue);
        prop_assert_eq!(
            issue.location().map(|location| location.line.get()),
            line_of(&text, &marker, occurrence),
            "the issue should be on the changed line\n{}",
            text
        );
    }
}

/// Returns the YAML parser's error in `report`, without its source snippet.
fn parser_error(report: &Report<ParseError>) -> &serde_saphyr::Error {
    report
        .frames()
        .find_map(|frame| frame.downcast_ref::<serde_saphyr::Error>())
        .expect("a syntax error should keep the YAML parser's error as its source")
        .without_snippet()
}

#[test]
fn alias_bomb_refused() {
    // Each step's branch holds ten copies of the step before it, so the last step stands for
    // 10^9 steps once its aliases are expanded.
    let mut text = String::from(
        "connector: demo\npipelines:\n  entities:\n    - source: a\n      steps:\n        - &s0 { \
         id: s, sql: x }\n",
    );
    for level in 1..10 {
        let previous = level - 1;
        let references = vec![format!("*s{previous}"); 10].join(", ");
        writeln!(
            text,
            "        - &s{level} {{ id: s, branches: [[{references}]] }}"
        )
        .expect("writing should succeed");
    }

    let report = Definition::from_yaml(&text).expect_err("an alias bomb should be refused");
    assert!(
        matches!(report.current_context(), ParseError::Syntax { .. }),
        "an alias bomb should stop at the YAML parser"
    );
    // A budget breach while the parser expands an alias becomes an `AliasError` that keeps only
    // the breach's message.
    let error = parser_error(&report);
    assert!(
        matches!(
            error,
            serde_saphyr::Error::AliasError { msg, .. } if msg.starts_with("budget breached: Nodes")
        ),
        "the parser's node budget should refuse the alias bomb, not: {error}"
    );
}

#[test]
fn deep_nesting_refused() {
    let depth = 10_000;
    let text = format!(
        "connector: demo\npipelines:\n  entities:\n    - source: a\n      steps:\n        - {}{{ \
         id: s, sql: x }}{}\n",
        "{ id: s, branches: [[".repeat(depth),
        "]] }".repeat(depth)
    );

    let report = Definition::from_yaml(&text).expect_err("deep nesting should be refused");
    assert!(
        matches!(report.current_context(), ParseError::Syntax { .. }),
        "deep nesting should stop at the YAML parser"
    );
    let error = parser_error(&report);
    assert!(
        matches!(
            error,
            serde_saphyr::Error::Budget {
                breach: BudgetBreach::Depth { .. },
                ..
            }
        ),
        "the parser's depth budget should refuse deep nesting, not: {error}"
    );
}
