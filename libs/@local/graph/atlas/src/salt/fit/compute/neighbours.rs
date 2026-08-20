//! The neighbour stage constructs, admits, and publishes the k-NN table, and smooths it into
//! the semantic graphs.

use super::{
    Context, Staged,
    error::ComputeError,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{repository::Binding, salt::artifact},
    identity::NodeRowId,
    progress::Progress,
    salt::{
        fit::{KnnConstructionChoice, Stage, stage_rng},
        knn::{
            construction::{IndexConstruction, KnnConstruction as _},
            descent::NnDescent,
            hannoy::{HannoyIndex, HannoyIndexError},
            recall::{self, RecallAdmission, RecallSpotCheck},
            table::Knn,
        },
        semantic::SemanticGraph,
    },
};

/// The neighbour stage, bound to the training domain it links.
pub(super) struct NeighbourAdmission<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The corpus-to-distinct row quotient.
    quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
}

impl<'fit> NeighbourAdmission<'fit> {
    /// Binds the stage to the quotient whose training domain it links.
    pub(super) const fn new(
        context: &'fit Context,
        quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
    ) -> Self {
        Self { context, quotient }
    }

    /// Constructs and admits the neighbour lists, then publishes the corpus table.
    ///
    /// Exact recall admits the lists. One construction runs at the wider of the spot check's
    /// depth and the stored width, so the admitted lists and the training table are the same
    /// lists. The published table covers the corpus row domain: under a real quotient every row
    /// takes its representative's list, and under the identity the admitted table is already the
    /// corpus's own. The admitted table speaks distinct rows, and the published failure surface
    /// speaks corpus rows.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::Index`] when the search backend fails,
    /// [`ComputeError::Descent`] when the NN-Descent construction fails,
    /// [`ComputeError::RecallBelowMinimum`] when the sample resolves a recall below the
    /// configured minimum, [`ComputeError::Knn`] when the table fails to assemble or admit, and
    /// an I/O error when the search backend's scratch directory does not create or the published
    /// table does not write.
    #[tracing::instrument(skip_all)]
    pub(super) fn run<P>(self, progress: &P) -> Result<(Neighbourhood, Expansion), ComputeError>
    where
        P: Progress + Sync,
    {
        let training = self.quotient.training();
        // Construction speaks distinct rows. The published failure surface speaks corpus rows.
        let corpus = |row: DistinctRowId| self.quotient.representative(row);

        let width = self
            .context
            .config
            .recall_check
            .neighbours
            .max(self.context.config.neighbours);

        let lists = {
            let _span = tracing::info_span!("knn-link").entered();
            let rng = stage_rng(self.context.config.seed, Stage::KnnLink);

            match self.context.config.construction {
                KnnConstructionChoice::Index => IndexConstruction::new(
                    HannoyIndex::new(
                        self.context.scratch.directory("knn")?,
                        self.context.config.index,
                    )
                    .map_err(HannoyIndexError::widen)?,
                )
                .construct(training, width, rng, progress)
                .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?,

                KnnConstructionChoice::Descent(options) => {
                    NnDescent::new(options).construct(training, width, rng, progress)?
                }
            }
        };

        let recall = tracing::info_span!("recall-check")
            .in_scope(|| {
                recall::spot_check_lists::<_, HannoyIndexError<DistinctRowId>>(
                    &lists,
                    training,
                    self.context.config.recall_check,
                    stage_rng(self.context.config.seed, Stage::RecallCheck),
                )
            })
            .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

        // The report comes before the admission decision. The run measured a construction
        // the floor rejects, and that measurement is what an operator is
        // watching for.
        progress.knn_recall(&recall);

        match recall.admission() {
            RecallAdmission::Admitted => {}
            RecallAdmission::Unresolved => tracing::warn!(
                recall = recall.recall(),
                minimum_recall = %recall.minimum_recall,
                resolution = %recall.resolution,
                sampled_rows = recall.sampled_rows,
                "the recall sample does not resolve the admission minimum"
            ),
            RecallAdmission::Refused => return Err(ComputeError::RecallBelowMinimum(recall)),
        }

        let _table_span = tracing::info_span!("knn-table").entered();
        let admitted = Knn::from_lists::<HannoyIndexError<DistinctRowId>>(
            &lists,
            self.context.config.neighbours,
        )
        .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

        let expanded = self.quotient.expand_neighbours(&admitted.view());
        let binding = match &expanded {
            Some(table) => self.context.staging.stage(artifact::Knn, table)?,
            None => self.context.staging.stage(artifact::Knn, &admitted)?,
        };

        tracing::info!(
            recall = recall.recall(),
            distinct = self.quotient.distinct_len(),
            "admitted and staged the k-NN table"
        );

        Ok((
            Neighbourhood {
                admitted,
                recall,
                binding,
            },
            Expansion(expanded),
        ))
    }
}

/// The corpus-domain expansion, waiting for the smoothing that spends it.
///
/// Under a real quotient the carrier holds the expanded corpus-domain table; under the identity
/// the admitted table is already the corpus's own and the carrier is empty. The smoothing
/// consumes the carrier by value, so a second smoothing does not compile.
pub(super) struct Expansion(Option<Knn<NodeRowId>>);

/// The corpus's admitted neighbourhood structure.
///
/// The admitted table carries the training domain to the placement stage, and the binding and
/// the recall reading carry the published table to the seal.
pub(super) struct Neighbourhood {
    /// The admitted distinct-domain table, the trainer's.
    pub admitted: Knn<DistinctRowId>,
    /// The passed recall spot check, echoed into the metadata.
    pub recall: RecallSpotCheck,
    /// The published table's typed binding.
    pub binding: Binding<artifact::Knn>,
}

impl Neighbourhood {
    /// Smooths the neighbour tables into the training graph and the staged published graph.
    ///
    /// The published graph weighs the corpus-domain table, and the trainer's graph weighs the
    /// distinct table by the same kernel. Under the identity quotient the two domains are the
    /// same rows in the same order, so one graph serves both: it stages as the published
    /// artifact and returns as the training graph. The expansion arrives by value and does not
    /// survive the call.
    ///
    /// # Errors
    ///
    /// Returns an error when the staged graph does not write.
    #[tracing::instrument(skip_all)]
    pub(super) fn smooth(
        &self,
        context: &Context,
        expansion: Expansion,
    ) -> Result<Staged<SemanticGraph<DistinctRowId>, artifact::Semantic, ()>, ComputeError> {
        let distinct = SemanticGraph::build(&self.admitted.view(), context.config.smoothing);

        let binding = match expansion.0 {
            Some(corpus) => {
                let graph = SemanticGraph::build(&corpus.view(), context.config.smoothing);
                context.staging.stage(artifact::Semantic, &graph)?
            }
            None => context.staging.stage(artifact::Semantic, &distinct)?,
        };
        tracing::info!("staged the semantic graph");

        Ok(Staged {
            value: distinct,
            binding,
            evidence: (),
        })
    }
}
