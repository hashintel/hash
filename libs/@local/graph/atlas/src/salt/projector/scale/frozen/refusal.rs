//! The ruler's one refusal class.

use core::{error::Error, fmt};

use crate::math::{DNonNegative, DPositive, Positive};

/// An invalid ruler refuses before training, and every failed check is this one class.
///
/// A missing reference, a missing `ε_rel`, an out-of-window `ε_rel`, and a representation failure
/// are the same refusal - the estimand's denominator does not exist, so no fit starts. The
/// variants carry the failed check's reading and nothing branches on them: there is no degraded
/// mode. The missing-reference and missing-epsilon variants are the trainer's to construct,
/// where schedule and configuration are validated. The rest are this module's.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum InvalidRuler<N> {
    /// The schedule names no relation boundary, so no zero-condition field exists to measure on:
    /// the zero field must exist as a trained control before it can serve as one.
    MissingReference,
    /// No `ε_rel` is declared, so the regularizer does not exist.
    MissingEpsilon,
    /// A local scale overflowed the finite range at the freeze, naming the smallest affected
    /// row: the boundary field carries pre-divergence coordinates.
    NonFiniteScale {
        /// The smallest affected node row.
        row: N,
    },
    /// The boundary field's RMS spread is not a strictly positive f32, so no degree-one unit
    /// carrier exists. Zero spread means every row coincides. An unrepresentable spread means
    /// the field is already past the working precision.
    SpreadOutOfDomain {
        /// The spread as measured, in double precision.
        spread: f64,
    },
    /// Every local scale is zero, so the window's upper bound has no positive-scale
    /// distribution to read.
    NoPositiveScale,
    /// The window is empty: the lower test's floor exceeds the upper bound, so replicate noise
    /// is not small against the corpus's local-scale distribution and no `ε_rel` is honest.
    EmptyWindow {
        /// `κ_ε · β_proj`.
        floor: DPositive,
        /// `q⁺(ρ₀) / s_ref`.
        ceiling: DNonNegative,
    },
    /// The declared `ε_rel` lies outside the window.
    OutOfWindow {
        /// The declared value.
        epsilon_rel: Positive,
        /// `κ_ε · β_proj`, when the band artifact exists.
        floor: Option<DPositive>,
        /// `q⁺(ρ₀) / s_ref`.
        ceiling: DNonNegative,
    },
    /// `ε² = (ε_rel · s_ref)²` falls below the value domain's minimum positive value, so a
    /// coincident pair's product would round to zero.
    RepresentationFloor {
        /// `ε_rel · s_ref` in double precision: the narrowed working value widened exactly,
        /// or the exact product where narrowing underflows to zero.
        epsilon_abs: DPositive,
    },
    /// The largest ε-shifted scale's square leaves the finite range, so a pair of the densest
    /// rows would overflow.
    RepresentationCeiling {
        /// `max ρ₀ + ε`, the exact double sum.
        shifted_scale: DPositive,
    },
}

impl<N> InvalidRuler<N> {
    /// Maps the row the refusal names into another row domain.
    pub(crate) fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> InvalidRuler<M> {
        match self {
            Self::MissingReference => InvalidRuler::MissingReference,
            Self::MissingEpsilon => InvalidRuler::MissingEpsilon,
            Self::NonFiniteScale { row: affected } => {
                InvalidRuler::NonFiniteScale { row: row(affected) }
            }
            Self::SpreadOutOfDomain { spread } => InvalidRuler::SpreadOutOfDomain { spread },
            Self::NoPositiveScale => InvalidRuler::NoPositiveScale,
            Self::EmptyWindow { floor, ceiling } => InvalidRuler::EmptyWindow { floor, ceiling },
            Self::OutOfWindow {
                epsilon_rel,
                floor,
                ceiling,
            } => InvalidRuler::OutOfWindow {
                epsilon_rel,
                floor,
                ceiling,
            },
            Self::RepresentationFloor { epsilon_abs } => {
                InvalidRuler::RepresentationFloor { epsilon_abs }
            }
            Self::RepresentationCeiling { shifted_scale } => {
                InvalidRuler::RepresentationCeiling { shifted_scale }
            }
        }
    }
}

impl<N> fmt::Display for InvalidRuler<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::MissingReference => {
                fmt.write_str("the schedule names no relation boundary to measure the ruler on")
            }
            Self::MissingEpsilon => fmt.write_str("no relative epsilon is declared for the ruler"),
            Self::NonFiniteScale { ref row } => {
                write!(
                    fmt,
                    "the frozen local scale of node row {row} is non-finite"
                )
            }
            Self::SpreadOutOfDomain { spread } => write!(
                fmt,
                "the boundary field's spread {spread} is not a strictly positive f32",
            ),
            Self::NoPositiveScale => fmt.write_str(
                "every frozen local scale is zero, so the epsilon window has no upper bound to \
                 read",
            ),
            Self::EmptyWindow { floor, ceiling } => write!(
                fmt,
                "the epsilon window is empty: the floor {floor} exceeds the ceiling {ceiling}",
            ),
            Self::OutOfWindow {
                epsilon_rel,
                floor,
                ceiling,
            } => match floor {
                Some(floor) => write!(
                    fmt,
                    "the relative epsilon {epsilon_rel} lies outside the window [{floor}, \
                     {ceiling}]",
                ),
                None => write!(
                    fmt,
                    "the relative epsilon {epsilon_rel} exceeds the window ceiling {ceiling}",
                ),
            },
            Self::RepresentationFloor { epsilon_abs } => write!(
                fmt,
                "the absolute epsilon {epsilon_abs} squares below the value domain's minimum \
                 positive value",
            ),
            Self::RepresentationCeiling { shifted_scale } => write!(
                fmt,
                "the largest epsilon-shifted scale {shifted_scale} squares past the value \
                 domain's maximum",
            ),
        }
    }
}

impl<N> Error for InvalidRuler<N> where N: fmt::Debug + fmt::Display {}
