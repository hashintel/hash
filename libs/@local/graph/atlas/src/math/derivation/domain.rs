//! Scalar validation and carrier operations for deferred arithmetic.

use super::Derivation;
use crate::math::scalar::{DFinite, DNonNegative, DPositive, Finite, NonNegative, Positive};

/// An operand's conversion to its raw arithmetic carrier.
///
/// Scalars supply validated values, while derivations supply unvalidated intermediate values.
/// Arithmetic accepting this trait can combine both forms.
pub(crate) impl(self) const trait IntoCarrier: Sized {
    /// The raw carrier the operand computes in.
    type Carrier: Copy;

    /// Returns the raw carrier value.
    fn into_carrier(self) -> Self::Carrier;
}

/// A validated domain a derivation can finish into.
///
/// Validation follows the scalar type's constructor, including any normalization it performs.
pub(crate) impl(self) const trait Domain: [const] IntoCarrier {
    /// Validates a raw carrier value into the domain.
    fn validate(raw: Self::Carrier) -> Option<Self>;

    /// Claims a raw carrier value as a domain member without validating.
    ///
    /// The caller must establish that `raw` satisfies the domain's membership requirements.
    fn unchecked(raw: Self::Carrier) -> Self;
}

/// Fused multiplication and addition at the carrier's precision.
pub(crate) impl(self) const trait MulAdd: Sized {
    /// Computes `self · factor + addend` with one rounding.
    fn mul_add(self, factor: Self, addend: Self) -> Self;
}

const impl MulAdd for f32 {
    #[inline]
    fn mul_add(self, factor: Self, addend: Self) -> Self {
        self.mul_add(factor, addend)
    }
}

const impl MulAdd for f64 {
    #[inline]
    fn mul_add(self, factor: Self, addend: Self) -> Self {
        self.mul_add(factor, addend)
    }
}

const impl<D: Domain> IntoCarrier for Derivation<D> {
    type Carrier = D::Carrier;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.into_raw()
    }
}

const impl IntoCarrier for Finite {
    type Carrier = f32;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for Finite {
    #[inline]
    fn validate(raw: f32) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f32) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for Positive {
    type Carrier = f32;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for Positive {
    #[inline]
    fn validate(raw: f32) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f32) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for NonNegative {
    type Carrier = f32;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for NonNegative {
    #[inline]
    fn validate(raw: f32) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f32) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for DFinite {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DFinite {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for DNonNegative {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DNonNegative {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for DPositive {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DPositive {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}
