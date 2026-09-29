use alloc::{
    collections::{BTreeMap, BTreeSet, btree_map::Entry},
    vec::Vec,
};

use error_stack::{Report, ReportSink, TryReportTupleExt as _};

use super::{DefinitionParts, order::Dependencies};
use crate::{
    issue::{DefinitionIssue, DefinitionPath, IssueKind},
    link::{LinkInput, LinkPipeline},
    name::{CheckpointName, SourceName, StepId},
    pipeline::EntityPipeline,
    step::{Action, Properties, StepKind},
};

fn entities_path() -> DefinitionPath {
    DefinitionPath::default()
        .field("pipelines")
        .field("entities")
}

/// Checks the parts of a definition against each other and collects every issue.
pub(super) struct Check<'parts> {
    parts: &'parts DefinitionParts,
    issues: ReportSink<DefinitionIssue>,
    /// The position of the pipeline that reads each source.
    pipelines: BTreeMap<&'parts SourceName, usize>,
    /// The position of the entity pipeline that produces each checkpoint.
    producers: BTreeMap<&'parts CheckpointName, usize>,
    steps: BTreeSet<&'parts StepId>,
}

impl<'parts> Check<'parts> {
    fn report(&mut self, path: DefinitionPath, kind: IssueKind) {
        self.issues.capture(DefinitionIssue {
            path,
            kind,
            location: None,
        });
    }

    fn pipeline_sources(&mut self) {
        let entities = entities_path();

        for (index, pipeline) in self.parts.entity_pipelines.iter().enumerate() {
            let path = entities.clone().index(index).field("source");
            if !self.parts.sources.contains_key(&pipeline.source) {
                self.report(
                    path.clone(),
                    IssueKind::UndeclaredSource {
                        source: pipeline.source.clone(),
                    },
                );
            }
            match self.pipelines.entry(&pipeline.source) {
                Entry::Vacant(entry) => {
                    entry.insert(index);
                }
                Entry::Occupied(_) => self.report(
                    path,
                    IssueKind::DuplicatePipeline {
                        source: pipeline.source.clone(),
                    },
                ),
            }
        }

        for source in self.parts.sources.keys() {
            if !self.pipelines.contains_key(source) {
                let path = DefinitionPath::default().field("sources").key(source);
                self.report(
                    path,
                    IssueKind::UnusedSource {
                        source: source.clone(),
                    },
                );
            }
        }
    }

    fn step_id(&mut self, step: &'parts StepId, path: &DefinitionPath) {
        if !self.steps.insert(step) {
            self.report(
                path.clone().field("id"),
                IssueKind::DuplicateStep { step: step.clone() },
            );
        }
    }

    fn properties(&mut self, properties: &Properties, path: &DefinitionPath) {
        for (property_type, accessor) in properties {
            if let Some(unit_map) = accessor.unit_map()
                && !self.parts.unit_maps.contains_key(unit_map)
            {
                self.report(
                    path.clone().key(property_type),
                    IssueKind::UnknownUnitMap {
                        unit_map: unit_map.clone(),
                    },
                );
            }
        }
    }

    fn action(&mut self, pipeline_index: usize, action: &'parts Action, path: &DefinitionPath) {
        match action {
            Action::Sql(_) => {}
            Action::Checkpoint(checkpoint) => match self.producers.entry(checkpoint) {
                Entry::Vacant(entry) => {
                    entry.insert(pipeline_index);
                }
                Entry::Occupied(_) => self.report(
                    path.clone().field("checkpoint"),
                    IssueKind::DuplicateCheckpoint {
                        checkpoint: checkpoint.clone(),
                    },
                ),
            },
            Action::Sink(sink) => {
                self.properties(
                    &sink.properties,
                    &path.clone().field("sink").field("properties"),
                );
            }
        }
    }

    fn entity_steps(&mut self, pipeline_index: usize, pipeline: &'parts EntityPipeline) {
        let steps = entities_path().index(pipeline_index).field("steps");

        for (step_index, step) in pipeline.steps.iter().enumerate() {
            let path = steps.clone().index(step_index);
            self.step_id(&step.id, &path);

            match &step.kind {
                StepKind::Action(action) => self.action(pipeline_index, action, &path),
                StepKind::Branch(branches) => {
                    let branches_path = path.field("branches");
                    for (branch_index, branch) in branches.iter().enumerate() {
                        let branch_path = branches_path.clone().index(branch_index);
                        for (inner_index, inner) in branch.iter().enumerate() {
                            let inner_path = branch_path.clone().index(inner_index);
                            self.step_id(&inner.id, &inner_path);
                            self.action(pipeline_index, &inner.action, &inner_path);
                        }
                    }
                }
            }
        }
    }

    fn link_input(&mut self, link: &LinkPipeline, path: &DefinitionPath) {
        match &link.input {
            LinkInput::Checkpoint(checkpoint) => {
                if !self.producers.contains_key(checkpoint) {
                    self.report(
                        path.clone().field("checkpoint"),
                        IssueKind::UnknownCheckpoint {
                            checkpoint: checkpoint.clone(),
                        },
                    );
                }
            }
            LinkInput::Inputs(inputs) => {
                let inputs_path = path.clone().field("inputs");
                if inputs.iter().len() > 1 && link.steps.is_empty() {
                    self.report(inputs_path.clone(), IssueKind::UncombinedInputs);
                }

                for (alias, checkpoint) in inputs {
                    if !self.producers.contains_key(checkpoint) {
                        self.report(
                            inputs_path.clone().key(alias),
                            IssueKind::UnknownCheckpoint {
                                checkpoint: checkpoint.clone(),
                            },
                        );
                    }
                }
            }
        }
    }

    fn links(&mut self) {
        let links = DefinitionPath::default().field("pipelines").field("links");
        let mut ids = BTreeSet::new();

        for (index, link) in self.parts.link_pipelines.iter().enumerate() {
            let path = links.clone().index(index);
            if !ids.insert(&link.id) {
                self.report(
                    path.clone().field("id"),
                    IssueKind::DuplicateLink {
                        link: link.id.clone(),
                    },
                );
            }

            self.link_input(link, &path);

            for (step_index, step) in link.steps.iter().enumerate() {
                self.step_id(&step.id, &path.clone().field("steps").index(step_index));
            }

            self.properties(&link.properties, &path.field("properties"));
        }
    }

    /// Records that the pipeline at `dependent` reads `checkpoint`, which must be produced by
    /// another pipeline.
    fn checkpoint_dependency(
        &mut self,
        dependencies: &mut Dependencies,
        dependent: usize,
        checkpoint: &CheckpointName,
        path: DefinitionPath,
    ) {
        match self.producers.get(checkpoint) {
            Some(&producer) if producer == dependent => self.report(
                path,
                IssueKind::ReadsOwnCheckpoint {
                    checkpoint: checkpoint.clone(),
                },
            ),
            Some(&producer) => dependencies.insert(dependent, producer),
            None => self.report(
                path,
                IssueKind::UnknownCheckpoint {
                    checkpoint: checkpoint.clone(),
                },
            ),
        }
    }

    /// Returns the positions of the entity pipelines in run order.
    ///
    /// # Errors
    ///
    /// Returns a [`IssueKind::DependencyCycle`] issue if the pipelines cannot be ordered.
    fn run_order(&mut self) -> Result<Vec<usize>, Report<DefinitionIssue>> {
        let entities = entities_path();
        let mut dependencies = Dependencies::new(self.parts.entity_pipelines.len());

        for (index, pipeline) in self.parts.entity_pipelines.iter().enumerate() {
            let path = entities.clone().index(index);

            for (position, source) in pipeline.depends_on.iter().enumerate() {
                let dependency_path = path.clone().field("dependsOn").index(position);
                if *source == pipeline.source {
                    self.report(dependency_path, IssueKind::DependsOnItself);
                } else if let Some(&dependency) = self.pipelines.get(source) {
                    dependencies.insert(index, dependency);
                } else {
                    self.report(
                        dependency_path,
                        IssueKind::UnknownPipeline {
                            source: source.clone(),
                        },
                    );
                }
            }

            for (alias, checkpoint) in &pipeline.inputs {
                let input_path = path.clone().field("inputs").key(alias);
                self.checkpoint_dependency(&mut dependencies, index, checkpoint, input_path);
            }

            if let Some(checkpoint) = self
                .parts
                .sources
                .get(&pipeline.source)
                .and_then(|source| source.checkpoint())
            {
                let source_path = DefinitionPath::default()
                    .field("sources")
                    .key(&pipeline.source)
                    .field("checkpoint");
                self.checkpoint_dependency(&mut dependencies, index, checkpoint, source_path);
            }
        }

        dependencies.run_order().map_err(|blocked| {
            Report::new(DefinitionIssue {
                path: entities,
                kind: IssueKind::DependencyCycle {
                    pipelines: blocked
                        .into_iter()
                        .filter_map(|index| self.parts.entity_pipelines.get(index))
                        .map(|pipeline| pipeline.source.clone())
                        .collect(),
                },
                location: None,
            })
        })
    }

    /// Checks `parts` and returns the positions of the entity pipelines in run order.
    pub(super) fn run(
        parts: &'parts DefinitionParts,
    ) -> Result<Vec<usize>, Report<[DefinitionIssue]>> {
        let mut check = Self {
            parts,
            issues: ReportSink::new(),
            pipelines: BTreeMap::new(),
            producers: BTreeMap::new(),
            steps: BTreeSet::new(),
        };

        check.pipeline_sources();
        for (index, pipeline) in parts.entity_pipelines.iter().enumerate() {
            check.entity_steps(index, pipeline);
        }
        check.links();
        let order = check.run_order();
        (check.issues.finish(), order)
            .try_collect()
            .map(|((), order)| order)
    }
}
