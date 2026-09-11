//! The freeze refuses a constraint the stored precision cannot carry.
//!
//! The live field arrives as a proven-finite point field, so divergence refuses at the field's own
//! construction, and what remains here is the constraint that does not exist over the stored
//! coordinates: a radius outside the working precision, or an extent past the finite range. A
//! radius below the landing margin's headroom refuses the same way.

use core::{error::Error, fmt};

use crate::math::{DPositive, Positive};

/// An invalid constraint refuses before training, and every freeze-time failure is this one
/// refusal class.
///
/// The declared constraint does not exist over the stored coordinates, so no fit starts. The
/// variants carry the failed check's reading and nothing branches on them: there is no
/// degraded mode.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum BandRefusal {
    /// The reconstructed radius `β · s_ref` is not a strictly positive f32, so the constraint
    /// has no enforceable size in the working precision.
    RadiusOutOfDomain {
        /// The product in double precision, where it is exact.
        radius: DPositive,
    },
    /// The snapshot's coordinate extent plus the radius leaves the finite f32 range, so a
    /// projected row could narrow to infinity.
    RepresentationCeiling {
        /// The extent as measured, in double precision.
        extent: DPositive,
    },
    /// The radius sits below the landing margin's headroom, so the stored precision cannot
    /// represent the constraint's boundary around the snapshot.
    RepresentationFloor {
        /// The enforced radius in the working precision.
        radius: Positive,
        /// The smallest lawful radius at this extent, `margin · 1024`.
        floor: DPositive,
    },
}

impl fmt::Display for BandRefusal {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::RadiusOutOfDomain { radius } => write!(
                fmt,
                "the reconstructed radius {radius} is not a strictly positive f32",
            ),
            Self::RepresentationCeiling { extent } => write!(
                fmt,
                "the snapshot extent {extent} leaves the finite f32 range",
            ),
            Self::RepresentationFloor { radius, floor } => write!(
                fmt,
                "the radius {radius} sits below the landing margin's headroom {floor}",
            ),
        }
    }
}

impl Error for BandRefusal {}
