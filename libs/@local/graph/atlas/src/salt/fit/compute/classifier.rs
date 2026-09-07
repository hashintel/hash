//! The classifier stage obtains the run's relation-policy classifier.

use core::{error::Error, fmt};
use std::io;

use hashql_core::id::IdSlice;

use super::{ClassifierPlan, Context};
use crate::{
    file::{
        repository::Binding,
        salt::{
            artifact,
            metadata::{
                ClassifierEvidence, ClassifierFitSummary, HoldoutEvidence, HoldoutRecord,
                RegularizationReading,
            },
        },
    },
    identity::CardRow,
    integrity::Sha256Digest,
    progress::Progress,
    salt::policy::{
        GeometryClass,
        annotation::assembly::AssembledCorpus,
        classifier::{
            Classifier, FitError, PredictError, TrainingSet, TrainingSetError,
            fit as fit_classifier,
        },
    },
};

/// The classifier stage failed and acquired no deployable model.
///
/// One variant per way the stage refuses, so a classifier failure attributes to this stage by
/// construction.
#[derive(Debug)]
pub(crate) enum ClassifierError {
    /// The assembled corpus violates the classifier's training-set contract.
    Training(TrainingSetError),
    /// The relation classifier failed to fit.
    Fit(FitError),
    /// A holdout card's prediction overflowed.
    Holdout(PredictError),
    /// A staged annotation artifact failed to write.
    Io(io::Error),
}

impl From<io::Error> for ClassifierError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for ClassifierError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Training(error) => write!(
                fmt,
                "the assembled corpus violates the training-set contract: {error}"
            ),
            Self::Fit(error) => write!(fmt, "the relation classifier failed to fit: {error}"),
            Self::Holdout(error) => write!(fmt, "a holdout card failed to classify: {error}"),
            Self::Io(error) => write!(fmt, "a staged annotation artifact failed to write: {error}"),
        }
    }
}

impl Error for ClassifierError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Training(error) => Some(error),
            Self::Fit(error) => Some(error),
            Self::Holdout(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// The staged annotation artifacts of one in-run classifier fit.
///
/// The corpus document beside the embedding table it assembled to.
pub(super) struct AnnotationArtifacts {
    pub corpus: Binding<artifact::AnnotationCorpus>,
    pub embeddings: Binding<artifact::AnnotationEmbeddings>,
    pub hashes: Binding<artifact::AnnotationHashes>,
}

/// The run's relation-policy classifier with its provenance.
///
/// The model classifies every relation type's card in the policy stage, and the evidence records
/// how it came to be: supplied to the run, or fitted from the assembled annotation corpus with
/// the fit and holdout readings.
pub(super) struct AcquiredClassifier {
    /// The deployable model.
    pub model: Classifier,
    /// How the model came to be, echoed into the metadata.
    pub evidence: ClassifierEvidence,
    /// The staged annotation artifacts of an in-run fit.
    pub annotation: Option<AnnotationArtifacts>,
}

impl AcquiredClassifier {
    /// Obtains the run's relation-policy classifier.
    ///
    /// A supplied model passes through, and an assembled corpus fits one, staging the annotation
    /// artifacts and recording the fit and holdout evidence.
    ///
    /// # Errors
    ///
    /// Returns [`ClassifierError::Training`] when the assembled corpus violates the classifier's
    /// training-set contract, [`ClassifierError::Fit`] when the fit fails,
    /// [`ClassifierError::Holdout`] when a holdout prediction overflows, and an I/O error when a
    /// staged annotation artifact does not write.
    pub(super) fn acquire<P: Progress + Sync>(
        context: &Context,
        plan: &ClassifierPlan,
        progress: &P,
    ) -> Result<Self, ClassifierError> {
        match plan {
            ClassifierPlan::Use { classifier, source } => Ok(Self {
                model: classifier.clone(),
                evidence: ClassifierEvidence::Supplied { source: *source },
                annotation: None,
            }),
            ClassifierPlan::Fit {
                corpus,
                source,
                staged,
            } => Self::fit(context, corpus, *source, *staged, progress),
        }
    }

    /// Fits the classifier from the assembled corpus and evaluates it on the holdout cards.
    #[tracing::instrument(name = "classifier-fit", skip_all)]
    fn fit<P: Progress + Sync>(
        context: &Context,
        corpus: &AssembledCorpus,
        source: Sha256Digest,
        staged: Binding<artifact::AnnotationCorpus>,
        progress: &P,
    ) -> Result<Self, ClassifierError> {
        let embeddings = context
            .staging
            .stage_with(artifact::AnnotationEmbeddings, |writer| {
                corpus.table().write_embeddings_into(writer)
            })?;
        let hashes = context
            .staging
            .stage_with(artifact::AnnotationHashes, |writer| {
                corpus.table().write_hashes_into(writer)
            })?;

        // The trained rows lead the embedding table; the holdout rows
        // after them are evaluation material. The pin claims the corpus's
        // card-row domain over the table's domain-neutral rows, and the
        // trained prefix keeps that domain.
        let rows = IdSlice::<CardRow, _>::from_raw(corpus.table().rows());
        let training = TrainingSet::new(rows.prefix(corpus.rows().bound()), corpus.rows())
            .map_err(ClassifierError::Training)?;
        let fitted = fit_classifier(training, context.config.policy.classifier_fit, progress)
            .map_err(ClassifierError::Fit)?;

        let mut evaluated = 0_usize;
        let mut agreements = 0_usize;
        let mut cards = Vec::with_capacity(corpus.holdouts().len());
        for holdout in corpus.holdouts() {
            let prediction = fitted
                .classifier
                .predict(&rows[holdout.row])
                .map_err(ClassifierError::Holdout)?;
            let predicted = GeometryClass::VARIANTS
                .into_iter()
                .max_by(|left, right| {
                    prediction
                        .calibrated
                        .probability(*left)
                        .cmp(&prediction.calibrated.probability(*right))
                })
                .unwrap_or_else(|| unreachable!("the class set is nonempty"));

            let agree = holdout.verdict.geometry().map(|human| human == predicted);
            if let Some(agree) = agree {
                evaluated += 1;
                agreements += usize::from(agree);
            }

            cards.push(HoldoutRecord {
                identity: holdout.identity.canonical_url(),
                human: holdout.verdict,
                predicted,
                agree,
            });
        }

        let evidence = corpus.evidence();
        tracing::info!(
            trained = evidence.trained,
            fold_groups = evidence.fold_groups,
            iterations = fitted.evidence.iterations,
            holdouts = cards.len(),
            evaluated,
            agreements,
            "fitted the relation classifier from the annotation corpus"
        );

        Ok(Self {
            model: fitted.classifier,
            evidence: ClassifierEvidence::Fitted {
                corpus: source,
                assembly: Box::new(*evidence),
                fit: ClassifierFitSummary {
                    folds: context.config.policy.classifier_fit.folds,
                    regularization: fitted.evidence.regularization,
                    selection: fitted
                        .evidence
                        .selection
                        .iter()
                        .map(|reading| RegularizationReading {
                            regularization: reading.regularization,
                            cross_entropy: reading.cross_entropy,
                        })
                        .collect(),
                    iterations: fitted.evidence.iterations,
                    raw_cross_entropy: fitted.evidence.raw_cross_entropy,
                    calibrated_cross_entropy: fitted.evidence.calibrated_cross_entropy,
                    raw_brier: fitted.evidence.raw_brier,
                    calibrated_brier: fitted.evidence.calibrated_brier,
                },
                holdout: HoldoutEvidence {
                    evaluated,
                    agreements,
                    cards,
                },
            },
            annotation: Some(AnnotationArtifacts {
                corpus: staged,
                embeddings,
                hashes,
            }),
        })
    }
}
