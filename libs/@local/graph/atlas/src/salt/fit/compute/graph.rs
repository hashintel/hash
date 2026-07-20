//! The neighbour and semantic graph stages.
use super::{
    super::{
        Stage,
        error::StageError,
        role::{Role, write_staged},
        stage_rng,
    },
    Context,
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    file::{repository::RepositoryFile, sprs::read::SprsFile},
    math::AlignedVecN,
    salt::{
        knn::{
            Embedding, NearestNeighboursIndex as _, artifact::MappedKnn, hannoy::HannoyIndex,
            recall, table::Knn,
        },
        semantic::{SemanticGraph, artifact::MappedSemanticGraph},
    },
};

impl Context<'_> {
    /// Builds the search backend over the mapped representations,
    /// admits it by exact recall, and stages the derived k-NN table.
    pub(super) fn build_neighbour_table(
        &self,
        rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ) -> Result<(recall::RecallSpotCheck, RepositoryFile), StageError> {
        let _span = tracing::info_span!("knn").entered();

        let mut index = HannoyIndex::new(self.scratch.directory("knn")?, self.config.index)?;
        {
            let _span = tracing::info_span!("knn-link").entered();
            index.insert_many(rows.iter().enumerate().map(|(row, components)| Embedding {
                id: NodeRowId::new(row as u64),
                components,
            }))?;

            index.build(stage_rng(self.config.seed, Stage::KnnLink))?;
        }

        let recall = tracing::info_span!("recall-check")
            .in_scope(|| {
                recall::spot_check(
                    &index,
                    rows,
                    self.config.recall_check,
                    stage_rng(self.config.seed, Stage::RecallCheck),
                )
            })
            .map_err(StageError::RecallCheck)?;
        if !recall.meets_minimum() {
            return Err(StageError::RecallBelowMinimum(recall));
        }

        let file = {
            let _span = tracing::info_span!("knn-table").entered();
            let table =
                Knn::build(&index, rows.len(), self.config.neighbours).map_err(StageError::Knn)?;

            write_staged(self.staging, Role::Knn, |writer| table.write_into(writer))?
        };

        Ok((recall, file))
    }

    /// Smooths the mapped k-NN table into the staged fuzzy semantic
    /// graph, mapping it back for the stages that consume it.
    pub(super) fn stage_semantic(
        &self,
        knn: &MappedKnn,
    ) -> Result<(RepositoryFile, MappedSemanticGraph), StageError> {
        let file = {
            let _span = tracing::info_span!("semantic").entered();
            let graph = SemanticGraph::build(&knn.view(), self.config.smoothing);
            write_staged(self.staging, Role::Semantic, |writer| {
                graph.write_into(writer)
            })?
        };

        let semantic = MappedSemanticGraph::new(SprsFile::open(
            self.staging.path_of(&Role::Semantic.file_name()),
        )?)?;
        tracing::info!("staged the semantic graph");

        Ok((file, semantic))
    }
}
