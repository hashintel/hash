//! The neighbour and semantic graph stages.
use super::{
    super::{
        KnnConstructionChoice, Stage,
        error::StageError,
        role::{Role, Staged, stage},
        stage_rng,
    },
    Context,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::sprs::read::SprsFile,
    math::AlignedVecN,
    salt::{
        knn::{
            artifact::KnnArchive,
            construction::{IndexConstruction, KnnConstruction as _, NeighbourLists},
            descent::NnDescent,
            hannoy::{HannoyIndex, HannoyIndexError},
            recall,
            table::Knn,
        },
        semantic::{SemanticGraph, artifact::SemanticGraphArchive},
    },
};

impl Context<'_> {
    /// Constructs the neighbour lists over the mapped representations.
    ///
    /// Admits them by exact recall, and stages the derived k-NN table, mapping it back for the
    /// stages that consume it. One construction runs at the wider of the spot check's depth and
    /// the stored width, so the admitted lists and the persisted table are the same lists.
    pub(super) fn build_neighbour_table(
        &self,
        rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ) -> Result<Staged<KnnArchive, recall::RecallSpotCheck>, StageError> {
        let _span = tracing::info_span!("knn").entered();

        let width = self
            .config
            .recall_check
            .neighbours
            .max(self.config.neighbours);
        let lists: NeighbourLists = {
            let _span = tracing::info_span!("knn-link").entered();
            let rng = stage_rng(self.config.seed, Stage::KnnLink);
            match self.config.construction {
                KnnConstructionChoice::Index => IndexConstruction::new(HannoyIndex::new(
                    self.scratch.directory("knn")?,
                    self.config.index,
                )?)
                .construct(rows, width, rng)?,
                KnnConstructionChoice::Descent(options) => {
                    NnDescent::new(options).construct(rows, width, rng)?
                }
            }
        };

        let recall = tracing::info_span!("recall-check").in_scope(|| {
            recall::spot_check_lists::<HannoyIndexError>(
                &lists,
                rows,
                self.config.recall_check,
                stage_rng(self.config.seed, Stage::RecallCheck),
            )
        })?;

        if !recall.meets_minimum() {
            return Err(StageError::RecallBelowMinimum(recall));
        }

        let file = {
            let _span = tracing::info_span!("knn-table").entered();
            let table = Knn::from_lists::<HannoyIndexError>(&lists, self.config.neighbours)?;

            stage(self.staging, Role::Knn, &table)?
        };

        let knn = KnnArchive::new(SprsFile::open(
            self.staging.path_of(&Role::Knn.file_name()),
        )?)?;
        tracing::info!(recall = recall.recall(), "staged the admitted k-NN table");

        Ok(Staged {
            file,
            artifact: knn,
            evidence: recall,
        })
    }

    /// Smooths the mapped k-NN table into the staged fuzzy semantic graph.
    ///
    /// Maps it back for the stages that consume it.
    pub(super) fn stage_semantic(
        &self,
        knn: &KnnArchive,
    ) -> Result<Staged<SemanticGraphArchive>, StageError> {
        let file = {
            let _span = tracing::info_span!("semantic").entered();
            let graph = SemanticGraph::build(&knn.view(), self.config.smoothing);
            stage(self.staging, Role::Semantic, &graph)?
        };

        let semantic = SemanticGraphArchive::new(SprsFile::open(
            self.staging.path_of(&Role::Semantic.file_name()),
        )?)?;
        tracing::info!("staged the semantic graph");

        Ok(Staged {
            file,
            artifact: semantic,
            evidence: (),
        })
    }
}
