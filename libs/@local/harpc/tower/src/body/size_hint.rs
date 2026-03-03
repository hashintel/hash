//! Adapted and vendored from `http-body` crate (<https://docs.rs/http-body/latest/src/http_body/size_hint.rs.html>).

use core::ops::Add;

/// A `Body` size hint.
///
/// The default implementation returns:
///
/// * 0 for `lower`
/// * `None` for `upper`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct SizeHint {
    lower: u64,
    upper: Option<u64>,
}

impl SizeHint {
    /// Returns a new `SizeHint` with default values.
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns a new `SizeHint` with both upper and lower bounds set to the
    /// given value.
    #[inline]
    #[must_use]
    pub const fn with_exact(value: u64) -> Self {
        Self {
            lower: value,
            upper: Some(value),
        }
    }

    /// Returns the lower bound of data that the `Body` will yield before
    /// completing.
    #[inline]
    #[must_use]
    pub const fn lower(&self) -> u64 {
        self.lower
    }

    /// Set the value of the `lower` hint.
    ///
    /// # Panics
    ///
    /// The function panics if `value` is greater than `upper`.
    #[inline]
    pub fn set_lower(&mut self, value: u64) {
        assert!(value <= self.upper.unwrap_or(u64::MAX));
        self.lower = value;
    }

    /// Returns the upper bound of data the `Body` will yield before
    /// completing, or `None` if the value is unknown.
    #[inline]
    #[must_use]
    pub const fn upper(&self) -> Option<u64> {
        self.upper
    }

    /// Set the value of the `upper` hint value.
    ///
    /// # Panics
    ///
    /// This function panics if `value` is less than `lower`.
    #[inline]
    pub const fn set_upper(&mut self, value: u64) {
        assert!(value >= self.lower, "`value` is less than than `lower`");

        self.upper = Some(value);
    }

    /// Returns the exact size of data that will be yielded **if** the
    /// `lower` and `upper` bounds are equal.
    #[inline]
    #[must_use]
    pub fn exact(&self) -> Option<u64> {
        if Some(self.lower) == self.upper {
            self.upper
        } else {
            None
        }
    }

    /// Set the value of the `lower` and `upper` bounds to exactly the same.
    #[inline]
    pub const fn set_exact(&mut self, value: u64) {
        self.lower = value;
        self.upper = Some(value);
    }
}

impl Add for SizeHint {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        let lower = self.lower + rhs.lower;
        let upper = match (self.upper, rhs.upper) {
            (Some(lhs), Some(rhs)) => Some(lhs + rhs),
            _ => None,
        };

        Self { lower, upper }
    }
}
