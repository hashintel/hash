//! The neighbour and semantic graph stages.
use hashql_core::id::IdSlice;

use super::{
    super::{
        KnnConstructionChoice, Stage,
        error::StageError,
        role::{Role, Staged, stage},
        stage_rng,
    },
    Context,
    quotient::{self, DistinctRowId, RowQuotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{generation::ScratchDirectory, sprs::read::SprsFile},
    identity::NodeRowId,
    math::AlignedVecN,
    progress::Progress,
    salt::{
        knn::{
            artifact::KnnArchive,
            construction::{IndexConstruction, KnnConstruction as _},
            descent::NnDescent,
            hannoy::{HannoyIndex, HannoyIndexError},
            recall::{self, RecallAdmission},
            table::Knn,
        },
        semantic::{SemanticGraph, artifact::SemanticGraphArchive},
    },
};

type NeighbourTable = (
    Staged<KnnArchive<NodeRowId>, recall::RecallSpotCheck>,
    KnnArchive<DistinctRowId>,
);

impl Context<'_> {
    /// Constructs the neighbour lists over the distinct representation rows.
    ///
    /// Admits them by exact recall, stages the corpus row-domain expansion - every row carries its
    /// representative's list, neighbours named by their first rows - and returns the staged table
    /// beside the distinct table the training stages consume, mapped back from `scratch`. One
    /// construction runs at the wider of the spot check's depth and the stored width, so the
    /// admitted lists, the persisted expansion, and the training table are the same lists.
    pub(super) fn build_neighbour_table<P>(
        &self,
        scratch: &ScratchDirectory,
        distinct: &IdSlice<DistinctRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        quotient: &RowQuotient,
        progress: &P,
    ) -> Result<NeighbourTable, StageError>
    where
        P: Progress + Sync,
    {
        let _span = tracing::info_span!("knn").entered();
        // Construction speaks distinct rows; the published failure surface speaks corpus rows.
        let corpus = |row: DistinctRowId| quotient.first_row(row);

        let width = self
            .config
            .recall_check
            .neighbours
            .max(self.config.neighbours);

        let lists = {
            let _span = tracing::info_span!("knn-link").entered();
            let rng = stage_rng(self.config.seed, Stage::KnnLink);

            match self.config.construction {
                KnnConstructionChoice::Index => IndexConstruction::new(
                    HannoyIndex::new(self.scratch.directory("knn")?, self.config.index)
                        .map_err(HannoyIndexError::widen)?,
                )
                .construct(distinct, width, rng, progress)
                .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?,

                KnnConstructionChoice::Descent(options) => {
                    NnDescent::new(options).construct(distinct, width, rng, progress)?
                }
            }
        };

        let recall = tracing::info_span!("recall-check")
            .in_scope(|| {
                recall::spot_check_lists::<_, HannoyIndexError<DistinctRowId>>(
                    &lists,
                    distinct,
                    self.config.recall_check,
                    stage_rng(self.config.seed, Stage::RecallCheck),
                )
            })
            .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

        // Reported before the gate: a construction the floor rejects was
        // measured, and the measurement is what an operator is watching for.
        progress.knn_recall(&recall);

        match recall.admission() {
            RecallAdmission::Admitted => {}
            // A build that ran out of measurement has not failed: the
            // sample publishes with the resolution it reached, and the
            // warning is what says so to whoever ran it.
            RecallAdmission::Unresolved => tracing::warn!(
                recall = recall.recall(),
                minimum_recall = recall.minimum_recall,
                resolution = recall.resolution,
                sampled_rows = recall.sampled_rows,
                "the recall sample does not resolve the admission minimum"
            ),
            RecallAdmission::Refused => return Err(StageError::RecallBelowMinimum(recall)),
        }

        let _table_span = tracing::info_span!("knn-table").entered();
        let table =
            Knn::from_lists::<HannoyIndexError<DistinctRowId>>(&lists, self.config.neighbours)
                .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

        let (file, distinct_table) = if quotient.is_identity() {
            // The distinct rows are the corpus: the table stages directly and both handles map the
            // staged file.
            let file = stage(self.staging, Role::Knn, &table)?;
            let distinct_table = KnnArchive::new(SprsFile::open(
                self.staging.path_of(&Role::Knn.file_name()),
            )?)?;

            (file, distinct_table)
        } else {
            let path = quotient::write_scratch(scratch, "knn.sprs", &table)?;
            let distinct_table = KnnArchive::new(SprsFile::open(path)?)?;

            let expanded = quotient::expand_neighbours(&distinct_table.view(), quotient);
            let file = stage(self.staging, Role::Knn, &expanded)?;

            (file, distinct_table)
        };

        let knn = KnnArchive::new(SprsFile::open(
            self.staging.path_of(&Role::Knn.file_name()),
        )?)?;
        tracing::info!(
            recall = recall.recall(),
            distinct = quotient.distinct_len(),
            "staged the admitted k-NN table"
        );

        Ok((
            Staged {
                file,
                artifact: knn,
                evidence: recall,
            },
            distinct_table,
        ))
    }

    /// Smooths the staged k-NN table into the staged fuzzy semantic graph, and the distinct table
    /// into the training twin.
    ///
    /// The published graph weighs the published table, so the staged pair stays derivable one from
    /// the other; the trainer's graph weighs the distinct table by the same kernel and maps back
    /// from `scratch`.
    pub(super) fn stage_semantic(
        &self,
        scratch: &ScratchDirectory,
        knn: &KnnArchive<NodeRowId>,
        distinct_knn: &KnnArchive<DistinctRowId>,
        quotient: &RowQuotient,
    ) -> Result<
        (
            Staged<SemanticGraphArchive<NodeRowId>>,
            SemanticGraphArchive<DistinctRowId>,
        ),
        StageError,
    > {
        let file = {
            let _span = tracing::info_span!("semantic").entered();
            let graph = SemanticGraph::build(&knn.view(), self.config.smoothing);
            stage(self.staging, Role::Semantic, &graph)?
        };

        let semantic = SemanticGraphArchive::new(SprsFile::open(
            self.staging.path_of(&Role::Semantic.file_name()),
        )?)?;

        let distinct = if quotient.is_identity() {
            // One graph serves both domains; the second handle maps
            // the same staged file.
            SemanticGraphArchive::new(SprsFile::open(
                self.staging.path_of(&Role::Semantic.file_name()),
            )?)?
        } else {
            let _span = tracing::info_span!("semantic-distinct").entered();

            let graph = SemanticGraph::build(&distinct_knn.view(), self.config.smoothing);
            let path = quotient::write_scratch(scratch, "semantic.sprs", &graph)?;

            SemanticGraphArchive::new(SprsFile::open(path)?)?
        };
        tracing::info!("staged the semantic graph");

        Ok((
            Staged {
                file,
                artifact: semantic,
                evidence: (),
            },
            distinct,
        ))
    }
}
