//! The neighbour stage constructs and admits the k-NN table of the training domain.

use super::{
    Context,
    error::ComputeError,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
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
    },
};

/// Constructs the neighbour lists over the distinct representation rows and admits them.
///
/// Exact recall admits the lists. One construction runs at the wider of the spot check's depth
/// and the stored width, so the admitted lists and the training table are the same lists. The
/// table speaks distinct rows, and the published failure surface speaks corpus rows.
///
/// # Errors
///
/// Returns [`ComputeError::Index`] when the search backend fails,
/// [`ComputeError::Descent`] when the NN-Descent construction fails,
/// [`ComputeError::RecallBelowMinimum`] when the sample resolves a recall below the configured
/// minimum, [`ComputeError::Knn`] when the table fails to assemble or admit, and an I/O error when
/// the search backend's scratch directory does not create.
#[tracing::instrument(name = "knn", skip_all)]
pub(super) fn admit<P>(
    context: &Context,
    quotient: &Quotient<'_, PROJECTOR_DIMENSIONS>,
    progress: &P,
) -> Result<(Knn<DistinctRowId>, RecallSpotCheck), ComputeError>
where
    P: Progress + Sync,
{
    let training = quotient.training();
    // Construction speaks distinct rows. The published failure surface speaks corpus rows.
    let corpus = |row: DistinctRowId| quotient.representative(row);

    let width = context
        .config
        .recall_check
        .neighbours
        .max(context.config.neighbours);

    let lists = {
        let _span = tracing::info_span!("knn-link").entered();
        let rng = stage_rng(context.config.seed, Stage::KnnLink);

        match context.config.construction {
            KnnConstructionChoice::Index => IndexConstruction::new(
                HannoyIndex::new(context.scratch.directory("knn")?, context.config.index)
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
                context.config.recall_check,
                stage_rng(context.config.seed, Stage::RecallCheck),
            )
        })
        .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

    // The report comes before the admission decision. The run measured a construction
    // the floor rejects, and that measurement is what an operator is
    // watching for.
    progress.knn_recall(&recall);

    match recall.admission() {
        RecallAdmission::Admitted => {}
        // A build that ran out of measurement has not failed: the
        // sample publishes with the resolution it reached, and the
        // warning is what says so to whoever ran it.
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
    let table =
        Knn::from_lists::<HannoyIndexError<DistinctRowId>>(&lists, context.config.neighbours)
            .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?;

    tracing::info!(
        recall = recall.recall(),
        distinct = quotient.distinct_len(),
        "admitted the k-NN table"
    );

    Ok((table, recall))
}
