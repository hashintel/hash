//! Assembly of the evidence record from one validated replay and its projections.

use hashql_core::id::{Id, IdSlice};

use super::{
    ArrivalReplay,
    design::NeighbourhoodDesign,
    draw::{ClassUniversePosition, DedupPosition, UniversePosition},
    metric::{MetricPass, PopulationCells},
    path::{ProjectedOutcome, PublishPath},
    plan::EstimandData,
    report::{
        ClassControlRow, ClassQueryRow, ControlRow, DedupBlock, NeighbourhoodBlock, QueryRow,
        ReplayReport,
    },
};
use crate::progress::Progress;

/// One estimand's metric pass with its population cells.
///
/// `I` is the estimand universe's position domain, so the entity and class runs cannot consume
/// each other's representatives, and each estimand's row builder below is bound to its own
/// domain.
struct EstimandRun<'run, I> {
    cells: Vec<PopulationCells>,
    pass: MetricPass<'run, I>,
}

impl<'run, I: Id> EstimandRun<'run, I> {
    /// A run over one estimand's data, with the diagnostic lens where one is handed over.
    fn new(
        designs: &'run [NeighbourhoodDesign],
        data: &'run EstimandData,
        dedup: Option<&'run IdSlice<DedupPosition, I>>,
    ) -> Self {
        // The designs were validated against the drawn universe cardinalities, so the data
        // arriving here must carry exactly those cardinalities.
        debug_assert!(
            designs
                .iter()
                .all(|design| design.estimand().universe()
                    == data.universe_embeddings().rows().len()),
            "every design must be validated against the estimand universe it observes",
        );
        debug_assert!(
            dedup.is_none_or(|representatives| designs
                .iter()
                .all(|design| design.dedup().universe() == representatives.len())),
            "every design must be validated against the diagnostic universe it observes",
        );

        Self {
            cells: designs
                .iter()
                .map(|design| PopulationCells::new(design, dedup.is_some()))
                .collect(),
            pass: MetricPass::new(
                designs,
                data.universe_embeddings().rows(),
                data.universe_wire(),
                dedup,
            ),
        }
    }

    /// Renders the estimand's population blocks in design order.
    fn blocks(
        &self,
        designs: &[NeighbourhoodDesign],
    ) -> impl IntoIterator<Item = NeighbourhoodBlock> {
        designs
            .iter()
            .zip(&self.cells)
            .map(|(design, cell)| cell.block(design.k()))
    }
}

impl EstimandRun<'_, UniversePosition> {
    /// Renders the deduplication diagnostic's blocks in design order.
    ///
    /// # Panics
    ///
    /// This panics when the run carries no diagnostic lens, which construction rules out for the
    /// entity estimand's run.
    fn dedup_blocks(
        &self,
        designs: &[NeighbourhoodDesign],
    ) -> impl IntoIterator<Item = DedupBlock> {
        designs.iter().zip(&self.cells).map(|(design, cell)| {
            cell.dedup_block(design.k())
                .expect("the entity cells should carry the deduplication diagnostic")
        })
    }

    /// The entity estimand's per-query and per-control rows.
    fn entity_rows(
        &mut self,
        replay: &ArrivalReplay,
        projected: &[ProjectedOutcome],
    ) -> (Vec<QueryRow>, Vec<ControlRow>) {
        let queries = replay
            .queries
            .iter()
            .map(|query| {
                let outcome = projected[query.slot];
                QueryRow {
                    entity: query.entity,
                    novelty: query.novelty,
                    outcome: outcome.kind(),
                    degree: query.incident.degree,
                    stable_incident: query.incident.stable_incident,
                    readings: self.pass.query(
                        &replay.plan.embeddings().rows()[query.slot],
                        query.refit_wire,
                        query.novelty,
                        outcome,
                        &mut self.cells,
                    ),
                }
            })
            .collect();

        let controls = replay
            .control_entities
            .iter()
            .enumerate()
            .map(|(slot, &entity)| ControlRow {
                entity,
                readings: self.pass.control(
                    &replay.entity.control_embeddings().rows()[slot],
                    replay.entity.control_earlier_wire()[slot],
                    &mut self.cells,
                ),
            })
            .collect();

        (queries, controls)
    }
}

impl EstimandRun<'_, ClassUniversePosition> {
    /// The class estimand's per-class and per-control rows.
    fn class_rows(
        &mut self,
        replay: &ArrivalReplay,
        projected: &[ProjectedOutcome],
    ) -> (Vec<ClassQueryRow>, Vec<ClassControlRow>) {
        let queries = replay
            .class_queries
            .iter()
            .map(|query| {
                let outcome = projected[query.slot];
                ClassQueryRow {
                    entity: query.entity,
                    members: query.members,
                    novelty: query.novelty,
                    outcome: outcome.kind(),
                    degree: query.incident.degree,
                    stable_incident: query.incident.stable_incident,
                    readings: self.pass.query(
                        &replay.plan.embeddings().rows()[query.slot],
                        query.refit_wire,
                        query.novelty,
                        outcome,
                        &mut self.cells,
                    ),
                }
            })
            .collect();

        let controls = replay
            .class_controls
            .iter()
            .enumerate()
            .map(|(slot, control)| ClassControlRow {
                entity: control.entity,
                members: control.members,
                readings: self.pass.control(
                    &replay.class.control_embeddings().rows()[slot],
                    replay.class.control_earlier_wire()[slot],
                    &mut self.cells,
                ),
            })
            .collect();

        (queries, controls)
    }
}

impl ArrivalReplay {
    /// Drives the publish path over the sampled rows and assembles the report.
    ///
    /// Projects each distinct sampled row once in bounded batches, recording placed,
    /// out-of-frame, and non-finite outcomes before computing any conditional metric. A
    /// non-finite row is recorded and the surrounding rows retried, so one bad row costs one
    /// reading, not the batch. Every rank reading then comes from its estimand's fixed
    /// comparison universe. Projection failures are outcomes the report records, not errors.
    ///
    /// # Panics
    ///
    /// This panics when the publish path violates its contract: an outcome count differing
    /// from the batch handed over, or a non-finite row named outside it.
    pub(crate) fn report<P: Progress>(
        self,
        path: &mut impl PublishPath,
        progress: &P,
    ) -> ReplayReport {
        let projected = path.project_queries(self.plan.embeddings().rows(), progress);

        let mut entity_run =
            EstimandRun::new(&self.designs, &self.entity, Some(self.dedup.as_slice()));
        let mut class_run: EstimandRun<'_, ClassUniversePosition> =
            EstimandRun::new(&self.designs, &self.class, None);

        let (query_rows, control_rows) = entity_run.entity_rows(&self, &projected);
        let (class_query_rows, class_control_rows) = class_run.class_rows(&self, &projected);
        let incident_edges = self.incident_summary();

        ReplayReport {
            earlier: self.generation.earlier,
            later: self.generation.later,
            earlier_axes: self.axes.earlier,
            later_axes: self.axes.later,
            seed: self.seed,
            requested: self.requested,
            populations: self.populations,
            outcomes: self
                .queries
                .iter()
                .map(|query| projected[query.slot])
                .collect(),
            class_outcomes: self
                .class_queries
                .iter()
                .map(|query| projected[query.slot])
                .collect(),
            neighbourhoods: entity_run.blocks(&self.designs).into_iter().collect(),
            class_neighbourhoods: class_run.blocks(&self.designs).into_iter().collect(),
            deduplicated: entity_run.dedup_blocks(&self.designs).into_iter().collect(),
            queries: query_rows,
            class_queries: class_query_rows,
            controls: control_rows,
            class_controls: class_control_rows,
            incident_edges,
        }
    }
}
