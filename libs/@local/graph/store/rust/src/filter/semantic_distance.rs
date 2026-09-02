use error_stack::Report;

/// The requested semantic distance is invalid.
#[derive(Debug, Copy, Clone, PartialEq, derive_more::Display, derive_more::Error)]
#[display("The semantic distance ({distance}) must be a finite value within the range [0, 2].")]
pub struct InvalidSemanticDistanceError {
    pub distance: f64,
}

/// A cosine distance threshold for embedding similarity search.
///
/// Cosine distance is `1 - cosine_similarity` (with similarity in `[-1, 1]`), so a valid distance
/// is always finite and within `[0, 2]`. Constructing a `SemanticDistance` enforces this invariant
/// once, so downstream code can rely on the value without re-validating it.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SemanticDistance(f64);

impl SemanticDistance {
    /// Returns the underlying cosine distance, guaranteed to be finite and within `[0, 2]`.
    #[must_use]
    pub const fn into_inner(self) -> f64 {
        self.0
    }
}

impl TryFrom<f64> for SemanticDistance {
    type Error = Report<InvalidSemanticDistanceError>;

    /// Creates a [`SemanticDistance`] from a raw cosine distance.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidSemanticDistanceError`] if `distance` is not finite or lies outside
    /// `[0, 2]`. `NaN` and infinities are rejected because they compare outside the range.
    fn try_from(distance: f64) -> Result<Self, Self::Error> {
        if !(0.0..=2.0).contains(&distance) {
            return Err(Report::new(InvalidSemanticDistanceError { distance }));
        }
        Ok(Self(distance))
    }
}

#[cfg(test)]
mod tests {
    use super::SemanticDistance;

    #[test]
    fn accepts_values_within_range() {
        for value in [0.0_f64, 0.5, 1.0, 1.5, 2.0] {
            let distance = SemanticDistance::try_from(value).expect("value should be valid");
            assert_eq!(distance.into_inner().to_bits(), value.to_bits());
        }
    }

    #[test]
    fn rejects_values_outside_range() {
        for value in [-0.000_001_f64, -1.0, 2.000_001, 3.0, f64::MAX, f64::MIN] {
            assert!(
                SemanticDistance::try_from(value).is_err(),
                "{value} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_non_finite_values() {
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(
                SemanticDistance::try_from(value).is_err(),
                "{value} should be rejected"
            );
        }
    }
}
