use alloc::borrow::Cow;
use core::{error::Error, f64};

use error_stack::{Report, ResultExt as _};
use hash_codec::numeric::Real;
use rand::{Rng, seq::IndexedRandom as _};
use rand_distr::{Distribution, Uniform};
use type_system::ontology::json_schema::{NumberConstraints, NumberSchema};

#[derive(Debug, derive_more::Display)]
pub enum NumberValueDistributionError {
    #[display("Enum is empty")]
    EmptyEnum,
    #[display("Invalid string length")]
    MinMax,
    #[display("Failed to convert number to real")]
    Conversion,
}

impl Error for NumberValueDistributionError {}

pub enum NumberValueDistribution<'e> {
    Constraints { value: Uniform<f64> },
    Enum { choices: Cow<'e, [Real]> },
}

impl<'e> NumberValueDistribution<'e> {
    #[expect(clippy::todo, reason = "Incomplete implementation")]
    #[expect(
        clippy::float_arithmetic,
        reason = "We need to calculate missing ranges"
    )]
    fn from_constraints(
        constraints: &NumberConstraints,
    ) -> Result<Self, Report<NumberValueDistributionError>> {
        if constraints.multiple_of.is_some() {
            todo!(
                "https://linear.app/hash/issue/H-5238/support-value-seeding-for-mulipleof-numbers"
            );
        }

        let min = match (&constraints.minimum, &constraints.exclusive_minimum) {
            (Some(min), Some(exclusive_min)) if min > exclusive_min => {
                Some((min.to_f64_lossy(), false))
            }
            (_, Some(exclusive_min)) => Some((exclusive_min.to_f64_lossy(), true)),
            (Some(min), None) => Some((min.to_f64_lossy(), false)),
            (None, None) => None,
        };
        let max = match (&constraints.maximum, &constraints.exclusive_maximum) {
            (Some(max), Some(exclusive_max)) if max < exclusive_max => {
                Some((max.to_f64_lossy(), false))
            }
            (_, Some(exclusive_max)) => Some((exclusive_max.to_f64_lossy(), true)),
            (Some(max), None) => Some((max.to_f64_lossy(), false)),
            (None, None) => None,
        };

        let (lo, hi, inclusive) = match (min, max) {
            (Some((min, true)), Some((max, inclusive))) => (min + 0.0001, max, inclusive),
            (Some((min, false)), Some((max, inclusive))) => (min, max, inclusive),
            (None, Some((max, inclusive))) => (max - (max * 0.01).abs(), max, inclusive),
            (Some((min, inclusive)), None) => (min + 0.0001, min + (min * 100.).abs(), inclusive),
            (None, None) => (-1000., 1000., true),
        };

        Ok(Self::Constraints {
            value: if inclusive {
                Uniform::new_inclusive(lo, hi)
                    .change_context(NumberValueDistributionError::MinMax)?
            } else {
                Uniform::new(lo, hi).change_context(NumberValueDistributionError::MinMax)?
            },
        })
    }

    fn from_enum(
        choices: impl Into<Cow<'e, [Real]>>,
    ) -> Result<Self, Report<NumberValueDistributionError>> {
        let choices = choices.into();

        if choices.is_empty() {
            return Err(NumberValueDistributionError::EmptyEnum.into());
        }

        Ok(Self::Enum { choices })
    }
}

impl TryFrom<NumberSchema> for NumberValueDistribution<'_> {
    type Error = Report<NumberValueDistributionError>;

    fn try_from(schema: NumberSchema) -> Result<Self, Self::Error> {
        match schema {
            NumberSchema::Constrained(constraints) => Self::from_constraints(&constraints),
            NumberSchema::Enum { r#enum } => Self::from_enum(r#enum),
        }
    }
}

impl<'a> TryFrom<&'a NumberSchema> for NumberValueDistribution<'a> {
    type Error = Report<NumberValueDistributionError>;

    fn try_from(schema: &'a NumberSchema) -> Result<Self, Self::Error> {
        match schema {
            NumberSchema::Constrained(constraints) => Self::from_constraints(constraints),
            NumberSchema::Enum { r#enum } => Self::from_enum(r#enum),
        }
    }
}

impl Distribution<Real> for NumberValueDistribution<'_> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Real {
        match self {
            Self::Constraints { value } => {
                let value = value.sample(rng);
                Real::try_from(value).unwrap_or_else(|error| {
                    unreachable!("Sampled value should never be `NaN`: {error}")
                })
            }
            Self::Enum { choices } => {
                let choice = choices
                    .choose(rng)
                    .unwrap_or_else(|| unreachable!("Choices somehow became empty"));
                choice.clone()
            }
        }
    }
}
