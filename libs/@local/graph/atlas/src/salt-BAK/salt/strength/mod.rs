//! Frozen relation-strength multipliers for attractive geometry.
//!
//! A strength head predicts ordered weak, standard and strong probabilities
//! from a relation-card embedding. With probabilities `π`, applicability `a`
//! and fixed band values `(0.5, 1, 2)`, the multiplier is
//!
//! ```text
//! raw = 0.5 * π_weak + π_standard + 2 * π_strong
//! h   = a * raw + (1 - a)
//! ```
//!
//! Consequently `h` remains in `[0.5, 2]` and approaches the unit multiplier
//! as applicability approaches zero. [`StrengthMode::Unit`] returns exactly
//! one. Strength affects admitted attraction only; admission and negative
//! protection must not depend on this module.

use core::{convert::Infallible, error::Error, fmt};

use camino::Utf8Path;

use crate::salt::{
    classifier::{
        ClassifierError, ClassifierFitConfig, ClassifierFitError, ClassifierOutput,
        ClassifierTrainingSet, ClassifierView, FittedClassifier, FittedClassifierScore,
        fit_classifier, publish_fitted_classifier_with_format,
    },
    format::STRENGTH_CLASSIFIER_FORMAT,
    policy::Probability,
    representation::CanonicalEmbedding,
    storage::mmap::{ArtifactView, ArtifactWriteError, PublishedArtifact},
};

const MINIMUM_STRENGTH: f64 = 0.5;
const MAXIMUM_STRENGTH: f64 = 2.0;
const POSTERIOR_SUM_TOLERANCE: f64 = 1.0e-12;
pub(crate) const STRENGTH_ELIGIBILITY_PROXIMAL: f64 = 0.2;

/// A finite relation-strength multiplier in `[0.5, 2]`.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
#[repr(transparent)]
pub(crate) struct RelationStrength(f64);

impl RelationStrength {
    /// The neutral attraction multiplier.
    pub(crate) const UNIT: Self = Self(1.0);

    /// Validates a materialized strength value.
    ///
    /// # Errors
    ///
    /// Returns an error when `value` is non-finite or outside `[0.5, 2]`.
    pub(crate) fn new(value: f64) -> Result<Self, StrengthError> {
        if !value.is_finite() {
            return Err(StrengthError::NonFinite { value });
        }
        if !(MINIMUM_STRENGTH..=MAXIMUM_STRENGTH).contains(&value) {
            return Err(StrengthError::OutOfRange { value });
        }
        Ok(Self(value))
    }

    /// Derives an applicability-shrunk multiplier from ordered band
    /// probabilities.
    ///
    /// # Errors
    ///
    /// Returns an error when the probabilities do not sum to one within the
    /// classifier tolerance.
    pub(crate) fn from_posterior(
        posterior: StrengthPosterior,
        applicability: Probability,
    ) -> Result<Self, StrengthError> {
        let sum = posterior.weak.get() + posterior.standard.get() + posterior.strong.get();
        if (sum - 1.0).abs() > POSTERIOR_SUM_TOLERANCE {
            return Err(StrengthError::PosteriorSum { actual: sum });
        }

        let raw = 0.5_f64.mul_add(
            posterior.weak.get(),
            posterior
                .standard
                .get()
                .mul_add(1.0, 2.0 * posterior.strong.get()),
        );
        let value = applicability.get().mul_add(raw, 1.0 - applicability.get());
        Self::new(value)
    }

    /// Returns the multiplier.
    #[must_use]
    #[inline]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

impl Default for RelationStrength {
    #[inline]
    fn default() -> Self {
        Self::UNIT
    }
}

/// Ordered strength-band probabilities.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct StrengthPosterior {
    pub weak: Probability,
    pub standard: Probability,
    pub strong: Probability,
}

/// Predicts a frozen strength multiplier from a full relation-card embedding.
pub(crate) trait StrengthHead {
    type Error;

    /// Evaluates one relation type without changing model state.
    fn predict(&self, embedding: CanonicalEmbedding<'_>) -> Result<RelationStrength, Self::Error>;
}

/// A calibrated shared linear strength model fitted from band votes.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FittedStrengthHead {
    classifier: FittedClassifier,
}

impl FittedStrengthHead {
    /// Borrows the fitting and grouped-validation artifact.
    #[must_use]
    #[inline]
    pub(crate) const fn classifier(&self) -> &FittedClassifier {
        &self.classifier
    }
}

impl StrengthHead for FittedStrengthHead {
    type Error = StrengthError;

    fn predict(&self, embedding: CanonicalEmbedding<'_>) -> Result<RelationStrength, Self::Error> {
        self.classifier
            .score(embedding)
            .map_err(StrengthError::Classifier)
            .and_then(strength_from_score)
    }
}

/// Validated mmap-backed strength head.
#[derive(Debug, Copy, Clone)]
pub(crate) struct StrengthHeadView<'artifact>(ClassifierView<'artifact>);

impl<'artifact> StrengthHeadView<'artifact> {
    /// Validates and borrows a strength-head artifact.
    ///
    /// # Errors
    ///
    /// This returns an error for an incompatible schema or malformed
    /// classifier parameters.
    pub(crate) fn new(artifact: ArtifactView<'artifact>) -> Result<Self, ClassifierError> {
        ClassifierView::new_with_format(artifact, STRENGTH_CLASSIFIER_FORMAT).map(Self)
    }
}

impl StrengthHead for StrengthHeadView<'_> {
    type Error = StrengthError;

    fn predict(&self, embedding: CanonicalEmbedding<'_>) -> Result<RelationStrength, Self::Error> {
        self.0
            .predict(embedding)
            .map_err(StrengthError::Classifier)
            .and_then(strength_from_output)
    }
}

/// Fits a shared calibrated head over weak, standard, and strong soft labels.
///
/// Rows must already satisfy the Proximal eligibility threshold. Keeping that
/// admission outside the model prevents the head from learning strength for
/// relation types that are not eligible for Proximal attraction.
///
/// # Errors
///
/// This returns classifier fitting errors unchanged.
pub(crate) fn fit_strength_head(
    training: ClassifierTrainingSet<'_>,
    config: ClassifierFitConfig,
) -> Result<FittedStrengthHead, ClassifierFitError> {
    fit_classifier(training, config).map(|classifier| FittedStrengthHead { classifier })
}

/// Atomically publishes a fitted strength head in its purpose-specific schema.
///
/// # Errors
///
/// This returns an error when fitted parameters cannot be encoded or immutable
/// publication fails.
pub(crate) fn publish_fitted_strength_head(
    path: &Utf8Path,
    head: &FittedStrengthHead,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    publish_fitted_classifier_with_format(path, &head.classifier, STRENGTH_CLASSIFIER_FORMAT)
}

/// Tests the fixed Proximal eligibility threshold for strength fitting.
#[must_use]
#[inline]
pub(crate) fn strength_eligible(proximal: Probability) -> bool {
    proximal.get() >= STRENGTH_ELIGIBILITY_PROXIMAL
}

/// Selects neutral strength or a frozen shared head.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum StrengthMode<Head = NoStrengthHead> {
    Unit,
    Head(Head),
}

impl<Head> StrengthMode<Head>
where
    Head: StrengthHead,
{
    /// Returns the attraction multiplier for one relation embedding.
    ///
    /// Unit mode does not invoke the configured head.
    pub(crate) fn predict(
        &self,
        embedding: CanonicalEmbedding<'_>,
    ) -> Result<RelationStrength, Head::Error> {
        match self {
            Self::Unit => Ok(RelationStrength::UNIT),
            Self::Head(head) => head.predict(embedding),
        }
    }
}

impl<Head> Default for StrengthMode<Head> {
    #[inline]
    fn default() -> Self {
        Self::Unit
    }
}

/// Uninhabited head type used by unit-only configurations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum NoStrengthHead {}

impl StrengthHead for NoStrengthHead {
    type Error = Infallible;

    fn predict(&self, _embedding: CanonicalEmbedding<'_>) -> Result<RelationStrength, Self::Error> {
        match *self {}
    }
}

/// An invalid strength value or posterior.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum StrengthError {
    NonFinite { value: f64 },
    OutOfRange { value: f64 },
    PosteriorSum { actual: f64 },
    Classifier(ClassifierError),
}

impl fmt::Display for StrengthError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NonFinite { value } => {
                write!(formatter, "relation strength {value} is not finite")
            }
            Self::OutOfRange { value } => {
                write!(formatter, "relation strength {value} is outside 0.5..=2")
            }
            Self::PosteriorSum { actual } => {
                write!(formatter, "strength posterior sums to {actual}, not one")
            }
            Self::Classifier(error) => write!(formatter, "strength classifier failed: {error}"),
        }
    }
}

impl Error for StrengthError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Classifier(error) => Some(error),
            Self::NonFinite { .. } | Self::OutOfRange { .. } | Self::PosteriorSum { .. } => None,
        }
    }
}

fn strength_from_score(score: FittedClassifierScore) -> Result<RelationStrength, StrengthError> {
    strength_from_probabilities(score.calibrated, score.applicability)
}

fn strength_from_output(output: ClassifierOutput) -> Result<RelationStrength, StrengthError> {
    strength_from_probabilities(
        [
            output.calibrated.coincident.get(),
            output.calibrated.proximal.get(),
            output.calibrated.overlay.get(),
        ],
        output.applicability.get(),
    )
}

fn strength_from_probabilities(
    calibrated: [f64; 3],
    applicability: f64,
) -> Result<RelationStrength, StrengthError> {
    let posterior = StrengthPosterior {
        weak: Probability::new(calibrated[0])
            .map_err(|_| StrengthError::Classifier(ClassifierError::NonFiniteOutput))?,
        standard: Probability::new(calibrated[1])
            .map_err(|_| StrengthError::Classifier(ClassifierError::NonFiniteOutput))?,
        strong: Probability::new(calibrated[2])
            .map_err(|_| StrengthError::Classifier(ClassifierError::NonFiniteOutput))?,
    };
    let applicability = Probability::new(applicability)
        .map_err(|_| StrengthError::Classifier(ClassifierError::NonFiniteOutput))?;
    RelationStrength::from_posterior(posterior, applicability)
}

#[cfg(test)]
mod tests;
