//! Connect persisted targets to their property mappings.
use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::{Action, Definition, EntitySink, LinkPipeline, StepKind};

use crate::{ArtifactRef, Code, Kind, StageError, Target, stage::diff::DiffOutput};

pub(super) enum Mapping<'definition> {
    Entity(&'definition EntitySink),
    Link(&'definition LinkPipeline),
}

pub(super) struct PlanTarget<'run> {
    pub target: &'run Target,
    pub mapping: Mapping<'run>,
    pub changes: &'run ArtifactRef,
    pub table: Box<str>,
}

pub(super) fn plan_targets<'run>(
    definition: Option<&'run Definition>,
    diff: &'run DiffOutput,
) -> Result<Vec<PlanTarget<'run>>, Report<StageError>> {
    let mut sinks = BTreeMap::new();
    for pipeline in definition
        .into_iter()
        .flat_map(Definition::entity_pipelines)
    {
        for step in &pipeline.steps {
            match &step.kind {
                StepKind::Action(Action::Sink(sink)) => {
                    sinks.insert(step.id.as_ref(), sink);
                }
                StepKind::Branch(branches) => {
                    for step in branches.iter().flatten() {
                        if let Action::Sink(sink) = &step.action {
                            sinks.insert(step.id.as_ref(), sink);
                        }
                    }
                }
                StepKind::Action(Action::Sql(_) | Action::Checkpoint(_)) => {}
            }
        }
    }
    let links = definition.map_or(&[][..], Definition::link_pipelines);
    diff.targets
        .iter()
        .filter_map(|(target, output)| output.changes.as_ref().map(|changes| (target, changes)))
        .map(|(target, changes)| {
            let mapping = match target.kind() {
                Kind::Entity => sinks.get(target.id()).copied().map(Mapping::Entity),
                Kind::Link => links
                    .iter()
                    .find(|link| link.id.as_ref() == target.id())
                    .map(Mapping::Link),
            }
            .ok_or_else(|| Code::InvalidCheckpoint.report())?;
            Ok(PlanTarget {
                target,
                mapping,
                changes,
                table: format!("changes/{target}").into_boxed_str(),
            })
        })
        .collect()
}
