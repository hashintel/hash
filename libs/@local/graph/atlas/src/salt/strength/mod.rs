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

use crate::salt::{policy::Probability, representation::CanonicalEmbedding};

const MINIMUM_STRENGTH: f64 = 0.5;
const MAXIMUM_STRENGTH: f64 = 2.0;
const POSTERIOR_SUM_TOLERANCE: f64 = 1.0e-12;

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
        }
    }
}

impl Error for StrengthError {}

#[cfg(test)]
mod tests;
