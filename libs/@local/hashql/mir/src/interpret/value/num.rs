//! Floating-point number representation for the MIR interpreter.

use core::cmp;

use hashql_core::value::Float;

/// A floating-point number value.
///
/// Wraps an [`f64`] with total ordering semantics, enabling use in ordered
/// collections and comparisons. Uses [`f64::total_cmp`] for consistent ordering
/// that handles NaN and negative zero correctly.
#[derive(Debug, Copy, Clone)]
pub struct Num {
    value: f64,
}

impl Num {
    /// Returns the underlying [`f64`] value.
    #[must_use]
    pub const fn as_f64(self) -> f64 {
        self.value
    }
}

impl<'heap> From<Float<'heap>> for Num {
    fn from(value: Float<'heap>) -> Self {
        Self {
            value: value.as_f64(),
        }
    }
}

impl From<f64> for Num {
    fn from(value: f64) -> Self {
        Self { value }
    }
}

impl PartialEq for Num {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for Num {}

impl PartialOrd for Num {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Num {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.value.total_cmp(&other.value)
    }
}
