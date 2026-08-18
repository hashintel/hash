//! The gauge's one refusal class, shared by the freeze and every fit.

use core::{error::Error, fmt};

use super::GaugeOrdinal;
use crate::math::{DNonNegative, DPositive, Positive};

/// A refused gauge publishes no activation candidate and records the failed reading.
///
/// Every variant is the failure table's alignment-degeneracy row. Nothing branches on them and
/// there is no degraded mode: a refused freeze has no gauge, a refused fit has no scale, and
/// training refuses the step rather than descending through a degenerate frame.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum GaugeRefusal {
    /// Fewer than two anchors: no constellation to fit a frame on.
    InsufficientAnchors {
        /// The anchors supplied.
        count: usize,
    },
    /// The anchors' frozen spread is not a strictly positive f32: the constellation is
    /// coincident, or past the working precision.
    DegenerateSpread {
        /// The spread as measured, in double precision.
        spread: f64,
    },
    /// The frozen spread sits below the declared band floor, so the frame's units are
    /// noise-owned.
    SpreadBelowFloor {
        /// `spread_G / band`.
        ratio: DPositive,
        /// The declared `κ`.
        kappa: Positive,
    },
    /// The effective anchor count falls below the declared minimum, so the fitted scale's
    /// stability has no sample behind it.
    UndersizedEffectiveCount {
        /// The Kish effective count over duplicate classes.
        effective: DNonNegative,
        /// The declared minimum.
        minimum: Positive,
    },
    /// The closed form refused, over coincident anchors, an exactly cancelling covariance, a
    /// non-finite coordinate, or a fitted coefficient outside the accepted range.
    FitRefused,
    /// The normalized residual exceeds the declared bar: the gauge constellation deformed
    /// beyond similarity, and the alignment is not a measurement.
    ResidualAboveBar {
        /// `RMS(S(x_c(g)) − x₀(g)) / spread_G`.
        residual: DNonNegative,
        /// The declared bar.
        bar: Positive,
    },
    /// One anchor's adjoint left the finite f32 range, naming the anchor.
    NonFiniteAdjoint {
        /// The affected anchor.
        ordinal: GaugeOrdinal,
    },
}

impl fmt::Display for GaugeRefusal {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::InsufficientAnchors { count } => {
                write!(fmt, "{count} anchors cannot carry a gauge frame")
            }
            Self::DegenerateSpread { spread } => write!(
                fmt,
                "the anchors' frozen spread {spread} is not a strictly positive f32",
            ),
            Self::SpreadBelowFloor { ratio, kappa } => write!(
                fmt,
                "the frozen spread is {ratio} bands where the floor requires {kappa}",
            ),
            Self::UndersizedEffectiveCount { effective, minimum } => write!(
                fmt,
                "the effective anchor count {effective} falls below the minimum {minimum}",
            ),
            Self::FitRefused => fmt.write_str(
                "the alignment fit refused: coincident anchors, a cancelling covariance, or a \
                 non-finite coordinate",
            ),
            Self::ResidualAboveBar { residual, bar } => write!(
                fmt,
                "the normalized residual {residual} exceeds the bar {bar}",
            ),
            Self::NonFiniteAdjoint { ordinal } => write!(
                fmt,
                "the scale adjoint of gauge anchor {ordinal} left the finite range",
            ),
        }
    }
}

impl Error for GaugeRefusal {}
