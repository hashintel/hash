use alloc::collections::{BTreeMap, BTreeSet};

use error_stack::Report;
use hash_integrations_definition::{
    CheckpointName, ColumnName, Definition, LinkEndpoint, LinkInput, Properties, SourceName,
};
use type_system::ontology::VersionedUrl;

use crate::{Code, StageError, Target, Workspace, run::error};

#[derive(Clone)]
pub(super) enum IdSource {
    Entity {
        entity_type: VersionedUrl,
        column: ColumnName,
    },
    Link {
        link_type: VersionedUrl,
        from: LinkEndpoint,
        to: LinkEndpoint,
    },
}

pub(super) struct PreparedTarget {
    pub target: Target,
    pub table: Box<str>,
    pub ids: IdSource,
    pub properties: Properties,
    pub sources: BTreeSet<SourceName>,
}

#[tracing::instrument(level = "debug", skip_all)]
pub(super) async fn prepare(
    workspace: &Workspace,
    definition: &Definition,
    staged: &BTreeMap<SourceName, Box<str>>,
) -> Result<Vec<PreparedTarget>, Report<StageError>> {
    let mut checkpoints = BTreeMap::new();
    let mut reads: BTreeMap<CheckpointName, BTreeSet<SourceName>> = BTreeMap::new();
    let mut targets = Vec::new();
    for pipeline in definition.entity_pipelines() {
        let source = definition
            .sources()
            .get(&pipeline.source)
            .ok_or_else(|| Code::InvalidDefinition.report())?;
        let (table, mut sources) = if let Some(checkpoint) = source.checkpoint() {
            (
                checkpoints
                    .get(checkpoint)
                    .cloned()
                    .ok_or_else(|| Code::QueryInvalid.report())?,
                reads
                    .get(checkpoint)
                    .cloned()
                    .ok_or_else(|| Code::QueryInvalid.report())?,
            )
        } else {
            (
                staged
                    .get(&pipeline.source)
                    .cloned()
                    .ok_or_else(|| Code::CaptureMissing.report())?,
                BTreeSet::from([pipeline.source.clone()]),
            )
        };
        for checkpoint in pipeline.inputs.values() {
            sources.extend(
                reads
                    .get(checkpoint)
                    .ok_or_else(|| Code::QueryInvalid.report())?
                    .iter()
                    .cloned(),
            );
        }
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), table, checkpoints.clone())
            .await
            .map_err(error::preparation)?;
        for checkpoint in prepared.checkpoints.keys() {
            reads.insert(checkpoint.clone(), sources.clone());
        }
        checkpoints.extend(prepared.checkpoints);
        for sink in prepared.sinks {
            targets.push(PreparedTarget {
                target: Target::entity(&sink.step),
                table: sink.table,
                ids: IdSource::Entity {
                    entity_type: sink.sink.entity_type,
                    column: sink.sink.entity_id,
                },
                properties: sink.sink.properties,
                sources: sources.clone(),
            });
        }
    }
    for link in definition.link_pipelines() {
        let mut sources = BTreeSet::new();
        let inputs: Vec<_> = match &link.input {
            LinkInput::Checkpoint(checkpoint) => vec![checkpoint],
            LinkInput::Inputs(inputs) => inputs
                .into_iter()
                .map(|(_, checkpoint)| checkpoint)
                .collect(),
        };
        for checkpoint in inputs {
            sources.extend(
                reads
                    .get(checkpoint)
                    .ok_or_else(|| Code::QueryInvalid.report())?
                    .iter()
                    .cloned(),
            );
        }
        let prepared = workspace
            .prepare_link_pipeline(link.clone(), checkpoints.clone())
            .await
            .map_err(error::preparation)?;
        targets.push(PreparedTarget {
            target: Target::link(&link.id),
            table: prepared.table,
            ids: IdSource::Link {
                link_type: link.link_type.clone(),
                from: link.from.clone(),
                to: link.to.clone(),
            },
            properties: link.properties.clone(),
            sources,
        });
    }
    Ok(targets)
}
