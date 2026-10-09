use alloc::{string::String, vec::Vec};

use error_stack::{ResultExt as _, TryReportIteratorExt as _, TryReportTupleExt as _};
use serde_saphyr::Spanned;

use crate::{
    issue::{DefinitionPath, IssueKind, SourceLocation},
    link::{LinkEndpoint, LinkInput, LinkInputs, LinkPipeline, LinkStep},
    name::{CheckpointName, ColumnName, InputAlias, LinkId, SourceName, StepId, UnitMapName},
    pipeline::EntityPipeline,
    step::{
        Accessor, Action, BranchStep, Branches, Coercion, EntitySink, InvalidBranches, Properties,
        Step, StepKind,
    },
    yaml::syntax::{
        AccessorFields, AccessorSyntax, BranchesSyntax, CoercionSyntax, EndpointSyntax,
        EntityPipelineSyntax, LinkPipelineSyntax, LinkStepSyntax, PipelinesSyntax, SinkSyntax,
        StepSyntax,
        lower::{Lowered, Lowering},
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
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<Accessor> {
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
                .name(column, &path.clone().field("column"))
                .map(Accessor::Column),
            AccessorFields {
                column: Some(column),
                coerce: Some(coercion),
                amount: None,
                unit: None,
                unit_map: None,
            } => lowering
                .name(column, &path.clone().field("column"))
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
                let amount = lowering.name::<ColumnName>(amount, &path.clone().field("amount"));
                let unit = lowering.name::<ColumnName>(unit, &path.clone().field("unit"));
                let unit_map =
                    lowering.name::<UnitMapName>(unit_map, &path.clone().field("unitMap"));
                let (amount, unit, unit_map) = (amount, unit, unit_map).try_collect()?;
                Ok(Accessor::Measure {
                    amount,
                    unit,
                    unit_map,
                })
            }
            AccessorFields { .. } => Err(lowering.report(path.clone(), IssueKind::InvalidAccessor)),
        }
    }
}

impl SpannedMap<AccessorSyntax> {
    /// Lowers property accessors keyed by property type URL.
    fn lower(&self, lowering: &mut Lowering, map_path: &DefinitionPath) -> Lowered<Properties> {
        let lowered = lowering.entries(
            self,
            map_path,
            |lowering, text, path| {
                let property_type = lowering.parse_url(text, path)?;
                // `Definition::new` reports a property at its parsed URL, which can print
                // differently from the written key.
                let location = lowering.locations.find(path);
                lowering.record_location(&map_path.clone().key(&property_type), location);
                Ok(property_type)
            },
            |lowering, accessor, path| accessor.lower(lowering, path),
        )?;

        Properties::try_from(lowered).map_err(|reason| {
            // Report the version that is written later in the document.
            let first = map_path.clone().key(&reason.first);
            let second = map_path.clone().key(&reason.second);
            let path = if lowering.locations.find(&first) > lowering.locations.find(&second) {
                first
            } else {
                second
            };
            lowering.report(path, IssueKind::ConflictingPropertyVersions { reason })
        })
    }
}

impl SinkSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<EntitySink> {
        let entity_type = lowering.url(&self.entity_type, &path.clone().field("entityType"));
        let entity_id = lowering.name(&self.entity_id, &path.clone().field("entityId"));
        let properties = self
            .properties
            .lower(lowering, &path.clone().field("properties"));

        let (entity_type, entity_id, properties) =
            (entity_type, entity_id, properties).try_collect()?;
        Ok(EntitySink {
            entity_type,
            entity_id,
            properties,
        })
    }
}

/// What a step does, named by its one key: `sql`, `checkpoint`, `sink` or `branches`.
#[derive(Clone, Copy)]
enum StepKindSyntax<'syntax> {
    Sql(&'syntax Spanned<String>),
    Checkpoint(&'syntax Spanned<String>),
    Sink(&'syntax SinkSyntax),
    Branches(&'syntax Spanned<BranchesSyntax>),
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

    fn action(self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<Action> {
        match self {
            Self::Sql(query) => lowering
                .query(query, &path.clone().field("sql"))
                .map(Action::Sql),
            Self::Checkpoint(checkpoint) => lowering
                .name(checkpoint, &path.clone().field("checkpoint"))
                .map(Action::Checkpoint),
            Self::Sink(sink) => sink
                .lower(lowering, &path.clone().field("sink"))
                .map(Action::Sink),
            Self::Branches(branches) => {
                let branches_path = path.clone().field("branches");
                lowering.record_location(&branches_path, SourceLocation::from_spanned(branches));
                Err(lowering.report(branches_path, IssueKind::NestedBranch))
            }
        }
    }
}

impl StepSyntax {
    /// Returns what the step does, or reports that it names no kind or several.
    fn kind(&self, lowering: &Lowering, path: &DefinitionPath) -> Lowered<StepKindSyntax<'_>> {
        let kinds = [
            self.sql.as_ref().map(StepKindSyntax::Sql),
            self.checkpoint.as_ref().map(StepKindSyntax::Checkpoint),
            self.sink.as_ref().map(StepKindSyntax::Sink),
            self.branches.as_ref().map(StepKindSyntax::Branches),
        ];
        let mut present = kinds.iter().flatten();

        match (present.next(), present.next()) {
            (Some(kind), None) => Ok(*kind),
            (None, _) => Err(lowering.report(
                path.clone(),
                IssueKind::MissingKind {
                    expected: StepKindSyntax::NAMES,
                },
            )),
            (Some(_), Some(_)) => Err(lowering.report(
                path.clone(),
                IssueKind::ConflictingKinds {
                    found: kinds.iter().flatten().map(|kind| kind.name()).collect(),
                },
            )),
        }
    }

    fn lower_in_branch(
        &self,
        lowering: &mut Lowering,
        path: &DefinitionPath,
    ) -> Lowered<BranchStep> {
        lowering.record_location(path, SourceLocation::from_spanned(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.clone().field("id"));
        let action = self
            .kind(lowering, path)
            .and_then(|kind| kind.action(lowering, path));

        let (id, action) = (id, action).try_collect()?;
        Ok(BranchStep { id, action })
    }

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<Step> {
        lowering.record_location(path, SourceLocation::from_spanned(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.clone().field("id"));

        let kind = self.kind(lowering, path).and_then(|kind| match kind {
            StepKindSyntax::Branches(branches) => {
                let branches_path = path.clone().field("branches");
                lowering.record_location(&branches_path, SourceLocation::from_spanned(branches));
                branches
                    .value
                    .lower(lowering, &branches_path)
                    .map(StepKind::Branch)
            }
            kind @ (StepKindSyntax::Sql(_)
            | StepKindSyntax::Checkpoint(_)
            | StepKindSyntax::Sink(_)) => kind.action(lowering, path).map(StepKind::Action),
        });

        let (id, kind) = (id, kind).try_collect()?;
        Ok(Step { id, kind })
    }
}

impl BranchesSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<Branches> {
        let lowered: Vec<Vec<BranchStep>> = self
            .0
            .iter()
            .enumerate()
            .map(|(branch_index, branch)| {
                let branch_path = path.clone().index(branch_index);
                lowering.record_location(&branch_path, SourceLocation::from_spanned(branch));
                branch
                    .value
                    .iter()
                    .enumerate()
                    .map(|(step_index, step)| {
                        step.lower_in_branch(lowering, &branch_path.clone().index(step_index))
                    })
                    .try_collect_reports()
            })
            .try_collect_reports()?;

        Branches::new(lowered).map_err(|reason| {
            let path = match reason {
                InvalidBranches::Empty => path.clone(),
                InvalidBranches::EmptyBranch { index } => path.clone().index(index),
            };
            lowering.report(path, IssueKind::InvalidBranches { reason })
        })
    }
}

impl EntityPipelineSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<EntityPipeline> {
        lowering.record_location(path, SourceLocation::from_spanned(&self.source));
        let source = lowering.name::<SourceName>(&self.source, &path.clone().field("source"));

        let depends_on_path = path.clone().field("dependsOn");
        let depends_on = self
            .depends_on
            .iter()
            .enumerate()
            .map(|(position, source)| {
                lowering.name::<SourceName>(source, &depends_on_path.clone().index(position))
            })
            .try_collect_reports();

        let inputs = lowering.map::<InputAlias, _, _>(
            &self.inputs,
            &path.clone().field("inputs"),
            Lowering::name::<CheckpointName>,
        );

        let steps_path = path.clone().field("steps");
        let steps = self
            .steps
            .iter()
            .enumerate()
            .map(|(position, step)| step.lower(lowering, &steps_path.clone().index(position)))
            .try_collect_reports();

        let (source, depends_on, inputs, steps) =
            (source, depends_on, inputs, steps).try_collect()?;
        Ok(EntityPipeline {
            source,
            depends_on,
            inputs,
            steps,
        })
    }
}

impl EndpointSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<LinkEndpoint> {
        let entity_type = lowering.url(&self.entity_type, &path.clone().field("entityType"));
        let column = lowering.name(&self.column, &path.clone().field("column"));

        let (entity_type, column) = (entity_type, column).try_collect()?;
        Ok(LinkEndpoint {
            entity_type,
            column,
        })
    }
}

impl LinkStepSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<LinkStep> {
        lowering.record_location(path, SourceLocation::from_spanned(&self.id));
        let id = lowering.name::<StepId>(&self.id, &path.clone().field("id"));
        let query = lowering.query(&self.sql, &path.clone().field("sql"));

        let (id, query) = (id, query).try_collect()?;
        Ok(LinkStep { id, query })
    }
}

impl LinkPipelineSyntax {
    const INPUTS: &'static [&'static str] = &["checkpoint", "inputs"];

    fn input(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<LinkInput> {
        match (&self.checkpoint, &self.inputs) {
            (Some(checkpoint), None) => lowering
                .name(checkpoint, &path.clone().field("checkpoint"))
                .map(LinkInput::Checkpoint),
            (None, Some(inputs)) => {
                let inputs_path = path.clone().field("inputs");
                lowering.record_location(&inputs_path, SourceLocation::from_spanned(inputs));
                let inputs = lowering.map::<InputAlias, _, _>(
                    &inputs.value,
                    &inputs_path,
                    Lowering::name::<CheckpointName>,
                )?;
                let inputs = LinkInputs::try_from(inputs)
                    .change_context_lazy(|| lowering.issue(inputs_path, IssueKind::EmptyInputs))?;
                Ok(LinkInput::Inputs(inputs))
            }
            (None, None) => Err(lowering.report(
                path.clone(),
                IssueKind::MissingKind {
                    expected: Self::INPUTS,
                },
            )),
            (Some(_), Some(_)) => Err(lowering.report(
                path.clone(),
                IssueKind::ConflictingKinds {
                    found: Self::INPUTS.into(),
                },
            )),
        }
    }

    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> Lowered<LinkPipeline> {
        lowering.record_location(path, SourceLocation::from_spanned(&self.id));
        let id = lowering.name::<LinkId>(&self.id, &path.clone().field("id"));
        let input = self.input(lowering, path);

        let steps_path = path.clone().field("steps");
        let steps = self
            .steps
            .iter()
            .enumerate()
            .map(|(position, step)| step.lower(lowering, &steps_path.clone().index(position)))
            .try_collect_reports();

        let from = self.from.lower(lowering, &path.clone().field("from"));
        let to = self.to.lower(lowering, &path.clone().field("to"));
        let link_type = lowering.url(&self.link_type, &path.clone().field("linkType"));
        let properties = self
            .properties
            .lower(lowering, &path.clone().field("properties"));

        let (id, input, steps, from, to, link_type, properties) =
            (id, input, steps, from, to, link_type, properties).try_collect()?;
        Ok(LinkPipeline {
            id,
            input,
            steps,
            from,
            to,
            link_type,
            properties,
        })
    }
}

impl PipelinesSyntax {
    pub(super) fn lower_entities(&self, lowering: &mut Lowering) -> Lowered<Vec<EntityPipeline>> {
        let entities_path = DefinitionPath::default()
            .field("pipelines")
            .field("entities");
        if let Some(first) = self.entities.first() {
            lowering.record_location(&entities_path, SourceLocation::from_spanned(&first.source));
        }

        self.entities
            .iter()
            .enumerate()
            .map(|(position, pipeline)| {
                pipeline.lower(lowering, &entities_path.clone().index(position))
            })
            .try_collect_reports()
    }

    pub(super) fn lower_links(&self, lowering: &mut Lowering) -> Lowered<Vec<LinkPipeline>> {
        let links_path = DefinitionPath::default().field("pipelines").field("links");

        self.links
            .iter()
            .enumerate()
            .map(|(position, link)| link.lower(lowering, &links_path.clone().index(position)))
            .try_collect_reports()
    }
}
