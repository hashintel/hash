//! The ruler's one refusal class.

use core::{error::Error, fmt};

use crate::math::{DNonNegative, DPositive, Positive};

/// The ruler's one refusal class, carrying the failed check's reading.
///
/// A missing reference, a missing `ε_rel`, an out-of-window `ε_rel`, and a representation failure
/// are the same refusal - the estimand's denominator does not exist, and the target phase does
/// not start. The variants carry the failed check's reading and nothing branches on them: there
/// is no degraded mode. The missing-reference and missing-epsilon variants are the trainer's to
/// construct at session admission, before the opening segment, where schedule and configuration
/// are validated. The rest are this module's, measured at the phase boundary after the opening
/// segment has trained.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum InvalidRuler<N> {
    /// The schedule names no relation boundary, and no zero-condition field exists to measure on.
    ///
    /// The zero field must exist as a trained control before it can serve as the ruler's
    /// reference.
    MissingReference,
    /// No `ε_rel` is declared, and the regularizer therefore does not exist.
    MissingEpsilon,
    /// A frozen local scale, a row's selected median distance, overflowed the finite range.
    ///
    /// The variant names the smallest affected row. A 2D distance's `f32` square or sum
    /// overflowed to `+∞` between finite boundary coordinates, and the escaped distances reached
    /// the row's median. Overflowed distances sorted past the median leave a scale finite.
    NonFiniteScale {
        /// The smallest affected node row.
        row: N,
    },
    /// The boundary field's RMS spread is not a strictly positive `f32`.
    ///
    /// No degree-one unit carrier therefore exists. Zero spread means every row coincides. An
    /// unrepresentable spread means the field is already past the working precision.
    SpreadOutOfDomain {
        /// The spread as measured, in double precision.
        spread: f64,
    },
    /// Every local scale is zero, and the window's upper bound has no positive scales to read.
    NoPositiveScale,
    /// The window is empty: the lower test's floor exceeds the upper bound.
    ///
    /// Replicate noise is then not small against the corpus's local-scale distribution, and no
    /// `ε_rel` is honest.
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
    /// The absolute `ε` fails the floor of the value domain.
    ///
    /// The product `ε_rel · s_ref` first rounds into the working `f32` value `ε`, and the check
    /// then squares that rounded `ε` exactly in double precision. The variant arises when the
    /// product underflows the working precision to zero, or when the rounded `ε`'s exact square
    /// falls below the domain's minimum positive value. The bound is an admission window on that
    /// exact square: it also refuses an `ε` whose square `f32` arithmetic would round up to the
    /// smallest subnormal rather than to zero.
    RepresentationFloor {
        /// The absolute `ε` the floor check refused, in double precision.
        ///
        /// The rounded working value `ε` widened exactly when its exact square fell below the
        /// minimum, or the exact double product `ε_rel · s_ref` when its narrowing into the
        /// working precision underflowed to zero and no working value exists.
        epsilon_abs: DPositive,
    },
    /// The largest ε-shifted scale's widened square reaches or exceeds the `f32` maximum.
    ///
    /// The check refuses at equality. It declares the representation window and does not by
    /// itself say that the pair of largest local scales' geometric mean would overflow.
    RepresentationCeiling {
        /// `max ρ₀ + ε`, the widened double sum.
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
