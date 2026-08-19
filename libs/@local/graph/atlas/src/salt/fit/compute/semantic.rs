//! The semantic stage smooths the neighbour tables into the fuzzy semantic graphs.

use super::{Context, error::ComputeError, quotient::DistinctRowId};
use crate::{
    file::repository::RepositoryFile,
    identity::NodeRowId,
    salt::{fit::role::Role, knn::table::Knn, semantic::SemanticGraph},
};

/// Smooths the neighbour tables into the training graph and the staged published graph.
///
/// The published graph weighs the corpus-domain table, and the trainer's graph weighs the
/// distinct table by the same kernel. Under the identity quotient the two domains are the same
/// rows in the same order, so one graph serves both: it stages as the published artifact and
/// returns as the training graph.
///
/// # Errors
///
/// Returns an error when the staged graph does not write.
#[tracing::instrument(name = "semantic", skip_all)]
pub(super) fn smooth(
    context: &Context,
    admitted: &Knn<DistinctRowId>,
    expanded: Option<&Knn<NodeRowId>>,
) -> Result<(RepositoryFile, SemanticGraph<DistinctRowId>), ComputeError> {
    let distinct = SemanticGraph::build(&admitted.view(), context.config.smoothing);

    let file = match expanded {
        Some(corpus) => {
            let graph = SemanticGraph::build(&corpus.view(), context.config.smoothing);
            context.staging.stage(Role::Semantic.file_name(), &graph)?
        }
        None => context
            .staging
            .stage(Role::Semantic.file_name(), &distinct)?,
    };
    tracing::info!("staged the semantic graph");

    Ok((file, distinct))
}
