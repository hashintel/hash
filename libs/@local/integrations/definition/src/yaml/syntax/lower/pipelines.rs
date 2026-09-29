use alloc::{collections::BTreeMap, vec::Vec};

use serde_saphyr::Spanned;

use super::{Lowering, all, location};
use crate::{
    issue::{DefinitionPath, IssueKind},
    link::{LinkEndpoint, LinkInput, LinkInputs, LinkPipeline, LinkStep},
    name::{CheckpointName, ColumnName, InputAlias, LinkId, SourceName, StepId, UnitMapName},
    pipeline::EntityPipeline,
    step::{
        Accessor, Action, BranchStep, Branches, Coercion, EntitySink, InvalidBranches, Properties,
        Step, StepKind,
    },
    yaml::syntax::{
        AccessorFields, AccessorSyntax, CoercionSyntax, EndpointSyntax, EntityPipelineSyntax,
        LinkPipelineSyntax, LinkStepSyntax, PipelinesSyntax, SinkSyntax, StepSyntax,
        spanned_map::SpannedMap,
    },
};

impl From<CoercionSyntax> for Coercion {
    fn from(coercion: CoercionSyntax) -> Self {
        match coercion {
            CoercionSyntax::Date => Self::Date,
            CoercionSyntax::Time => Self::Time,
            CoercionSyntax::Boolean => Self::Boolean,
            CoercionSyntax::Number => Self::Number,
            CoercionSyntax::Integer => Self::Integer,
            CoercionSyntax::Year => Self::Year,
            CoercionSyntax::Trim => Self::Trim,
        }
    }
}

impl AccessorSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<Accessor> {
        let fields = match self {
            Self::Column(column) => return lowering.column(column, path).map(Accessor::Column),
            Self::Fields(fields) => fields,
        };

        match &**fields {
            AccessorFields {
                column: Some(column),
                coerce: None,
                amount: None,
                unit: None,
                unit_map: None,
            } => lowering
                .name(column, &path.field("column"))
                .map(Accessor::Column),
            AccessorFields {
                column: Some(column),
                coerce: Some(coercion),
                amount: None,
                unit: None,
                unit_map: None,
            } => lowering
                .name(column, &path.field("column"))
                .map(|column| Accessor::Coerce {
                    column,
                    coercion: Coercion::from(*coercion),
                }),
            AccessorFields {
                column: None,
                coerce: None,
                amount: Some(amount),
                unit: Some(unit),
                unit_map: Some(unit_map),
            } => {
                let amount = lowering.name::<ColumnName>(amount, &path.field("amount"));
                let unit = lowering.name::<ColumnName>(unit, &path.field("unit"));
                let unit_map = lowering.name::<UnitMapName>(unit_map, &path.field("unitMap"));
                Some(Accessor::Measure {
                    amount: amount?,
                    unit: unit?,
                    unit_map: unit_map?,
                })
            }
            AccessorFields { .. } => {
                lowering.report(path.clone(), IssueKind::InvalidAccessor);
                None
            }
        }
    }
}

/// Lowers property accessors keyed by property type URL.
fn properties(
    lowering: &mut Lowering,
    map: &SpannedMap<AccessorSyntax>,
    map_path: &DefinitionPath,
) -> Option<Properties> {
    let mut lowered = BTreeMap::new();
    let mut complete = true;

    for (key, accessor) in map.iter() {
        let Some((text, path)) = lowering.key(key, map_path) else {
            complete = false;
            continue;
        };
        let property_type = lowering.parse_url(text.clone(), &path);
        // Checks report the property at the URL as `VersionedUrl` prints it.
        if let Some(property_type) = &property_type {
            lowering.locate(&map_path.key(property_type), location(key));
        }
        let accessor = accessor.lower(lowering, &path);
        let (Some(property_type), Some(accessor)) = (property_type, accessor) else {
            complete = false;
            continue;
        };
        if lowered.insert(property_type, accessor).is_some() {
            lowering.report_duplicate(path, location(key), text);
        }
    }

    let lowered = complete.then_some(lowered)?;
    Properties::try_from(lowered)
        .map_err(|reason| {
            let path = map_path.key(&reason.second);
            lowering.report(path, IssueKind::ConflictingPropertyVersions { reason });
        })
        .ok()
}

/// Lowers the branches of a branch step, each a list of steps.
fn branches(
    lowering: &mut Lowering,
    branches: &[Vec<StepSyntax>],
    path: &DefinitionPath,
) -> Option<Branches> {
    let lowered = all(branches
        .iter()
        .enumerate()
        .map(|(branch_index, branch)| {
            let branch_path = path.index(branch_index);
            all(branch
                .iter()
                .enumerate()
                .map(|(step_index, step)| {
                    step.lower_in_branch(lowering, &branch_path.index(step_index))
                })
                .collect())
        })
        .collect())?;

    Branches::new(lowered)
        .map_err(|reason| {
            let path = match reason {
                InvalidBranches::Empty => path.clone(),
                InvalidBranches::EmptyBranch { index } => path.index(index),
            };
            lowering.report(path, IssueKind::InvalidBranches { reason });
        })
        .ok()
}

impl SinkSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<EntitySink> {
        let entity_type = lowering.url(&self.entity_type, &path.field("entityType"));
        let entity_id = lowering.name(&self.entity_id, &path.field("entityId"));
        let properties = properties(lowering, &self.properties, &path.field("properties"));

        Some(EntitySink {
            entity_type: entity_type?,
            entity_id: entity_id?,
            properties: properties?,
        })
    }
}

/// What a step does, named by its one key: `sql`, `checkpoint`, `sink` or `branches`.
#[derive(Clone, Copy)]
enum StepKindSyntax<'syntax> {
    Sql(&'syntax Spanned<alloc::string::String>),
    Checkpoint(&'syntax Spanned<alloc::string::String>),
    Sink(&'syntax SinkSyntax),
    Branches(&'syntax [Vec<StepSyntax>]),
}

impl StepKindSyntax<'_> {
    const NAMES: &'static [&'static str] = &["sql", "checkpoint", "sink", "branches"];

    const fn name(self) -> &'static str {
        match self {
            Self::Sql(_) => "sql",
            Self::Checkpoint(_) => "checkpoint",
            Self::Sink(_) => "sink",
            Self::Branches(_) => "branches",
        }
    }

    fn action(self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<Action> {
        match self {
            Self::Sql(query) => lowering.query(query, &path.field("sql")).map(Action::Sql),
            Self::Checkpoint(checkpoint) => lowering
                .name(checkpoint, &path.field("checkpoint"))
                .map(Action::Checkpoint),
            Self::Sink(sink) => sink.lower(lowering, &path.field("sink")).map(Action::Sink),
            Self::Branches(_) => {
                lowering.report(path.field("branches"), IssueKind::NestedBranch);
                None
            }
        }
    }
}

impl StepSyntax {
    /// Returns what the step does, or reports that it names no kind or several.
    fn kind(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<StepKindSyntax<'_>> {
        let kinds = [
            self.sql.as_ref().map(StepKindSyntax::Sql),
            self.checkpoint.as_ref().map(StepKindSyntax::Checkpoint),
            self.sink.as_ref().map(StepKindSyntax::Sink),
            self.branches.as_deref().map(StepKindSyntax::Branches),
        ];
        let mut present = kinds.iter().flatten();

        match (present.next(), present.next()) {
            (Some(kind), None) => Some(*kind),
            (None, _) => {
                lowering.report(
                    path.clone(),
                    IssueKind::MissingKind {
                        expected: StepKindSyntax::NAMES,
                    },
                );
                None
            }
            (Some(_), Some(_)) => {
                lowering.report(
                    path.clone(),
                    IssueKind::ConflictingKinds {
                        found: kinds.iter().flatten().map(|kind| kind.name()).collect(),
                    },
                );
                None
            }
        }
    }

    fn lower_in_branch(
        &self,
        lowering: &mut Lowering,
        path: &DefinitionPath,
    ) -> Option<BranchStep> {
        lowering.locate(path, location(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.field("id"));
        let action = self
            .kind(lowering, path)
            .and_then(|kind| kind.action(lowering, path));

        Some(BranchStep {
            id: id?,
            action: action?,
        })
    }

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<Step> {
        lowering.locate(path, location(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.field("id"));

        let kind = match self.kind(lowering, path) {
            Some(StepKindSyntax::Branches(syntax)) => {
                branches(lowering, syntax, &path.field("branches")).map(StepKind::Branch)
            }
            Some(kind) => kind.action(lowering, path).map(StepKind::Action),
            None => None,
        };

        Some(Step {
            id: id?,
            kind: kind?,
        })
    }
}

impl EntityPipelineSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<EntityPipeline> {
        lowering.locate(path, location(&self.source));
        let source = lowering.name::<SourceName>(&self.source, &path.field("source"));

        let depends_on_path = path.field("dependsOn");
        let depends_on = all(self
            .depends_on
            .iter()
            .enumerate()
            .map(|(position, source)| {
                lowering.name::<SourceName>(source, &depends_on_path.index(position))
            })
            .collect());

        let inputs = lowering.map::<InputAlias, _, _>(
            &self.inputs,
            &path.field("inputs"),
            Lowering::name::<CheckpointName>,
        );

        let steps_path = path.field("steps");
        let steps = all(self
            .steps
            .iter()
            .enumerate()
            .map(|(position, step)| step.lower(lowering, &steps_path.index(position)))
            .collect());

        Some(EntityPipeline {
            source: source?,
            depends_on: depends_on?,
            inputs: inputs?,
            steps: steps?,
        })
    }
}

impl EndpointSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<LinkEndpoint> {
        let entity_type = lowering.url(&self.entity_type, &path.field("entityType"));
        let column = lowering.name(&self.column, &path.field("column"));

        Some(LinkEndpoint {
            entity_type: entity_type?,
            column: column?,
        })
    }
}

impl LinkStepSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<LinkStep> {
        lowering.locate(path, location(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.field("id"));
        let query = lowering.query(&self.sql, &path.field("sql"));

        Some(LinkStep {
            id: id?,
            query: query?,
        })
    }
}

impl LinkPipelineSyntax {
    const INPUTS: &'static [&'static str] = &["checkpoint", "inputs"];

    fn input(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<LinkInput> {
        match (&self.checkpoint, &self.inputs) {
            (Some(checkpoint), None) => lowering
                .name(checkpoint, &path.field("checkpoint"))
                .map(LinkInput::Checkpoint),
            (None, Some(inputs)) => {
                let inputs_path = path.field("inputs");
                let inputs = lowering.map::<InputAlias, _, _>(
                    inputs,
                    &inputs_path,
                    Lowering::name::<CheckpointName>,
                )?;
                LinkInputs::try_from(inputs)
                    .map_err(|error| {
                        lowering.report_caused(inputs_path, IssueKind::EmptyInputs, error);
                    })
                    .ok()
                    .map(LinkInput::Inputs)
            }
            (None, None) => {
                lowering.report(
                    path.clone(),
                    IssueKind::MissingKind {
                        expected: Self::INPUTS,
                    },
                );
                None
            }
            (Some(_), Some(_)) => {
                lowering.report(
                    path.clone(),
                    IssueKind::ConflictingKinds {
                        found: Self::INPUTS.to_vec(),
                    },
                );
                None
            }
        }
    }

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Option<LinkPipeline> {
        lowering.locate(path, location(&self.id));
        let id = lowering.name::<LinkId>(&self.id, &path.field("id"));
        let input = self.input(lowering, path);

        let steps_path = path.field("steps");
        let steps = all(self
            .steps
            .iter()
            .enumerate()
            .map(|(position, step)| step.lower(lowering, &steps_path.index(position)))
            .collect());

        let from = self.from.lower(lowering, &path.field("from"));
        let to = self.to.lower(lowering, &path.field("to"));
        let link_type = lowering.url(&self.link_type, &path.field("linkType"));
        let properties = properties(lowering, &self.properties, &path.field("properties"));

        Some(LinkPipeline {
            id: id?,
            input: input?,
            steps: steps?,
            from: from?,
            to: to?,
            link_type: link_type?,
            properties: properties?,
        })
    }
}

impl PipelinesSyntax {
    pub(super) fn lower_entities(&self, lowering: &mut Lowering) -> Option<Vec<EntityPipeline>> {
        let entities_path = DefinitionPath::default()
            .field("pipelines")
            .field("entities");
        if let Some(first) = self.entities.first() {
            lowering.locate(&entities_path, location(&first.source));
        }

        all(self
            .entities
            .iter()
            .enumerate()
            .map(|(position, pipeline)| pipeline.lower(lowering, &entities_path.index(position)))
            .collect())
    }

    pub(super) fn lower_links(&self, lowering: &mut Lowering) -> Option<Vec<LinkPipeline>> {
        let links_path = DefinitionPath::default().field("pipelines").field("links");

        all(self
            .links
            .iter()
            .enumerate()
            .map(|(position, link)| link.lower(lowering, &links_path.index(position)))
            .collect())
    }
}
