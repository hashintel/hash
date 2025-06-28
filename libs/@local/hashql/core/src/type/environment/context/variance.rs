/// Represents the type relationship variance used in generic type checking.
///
/// Variance defines how subtyping relationships between generic parameter types
/// affect subtyping relationships between the resulting parameterized types.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Variance {
    /// Covariance
    ///
    /// Covariance preserves the ordering of types, suppose `A` and `B` are types, and `I` is a type
    /// constructor. If `I` is covariant, and `A <: B` (A is a subtype of B), then `I<A> <: I<B>`.
    ///
    /// Example: If `Cat <: Animal`, then `List<Cat> <: List<Animal>` in a covariant position.
    #[default]
    Covariant,
    /// Contravariance
    ///
    /// Contravariance reverses the ordering of types, suppose `A` and `B` are types, and `I` is a
    /// type constructor. If `I` is contravariant, and `A <: B` (A is a subtype of B), then
    /// `I<B> <: I<A>`.
    ///
    /// Example: If `Cat <: Animal`, then `fn(Animal) -> Null <: fn(Cat) -> Void`
    /// for parameter types in a contravariant position.
    Contravariant,
    /// Invariance
    ///
    /// Invariance requires exact match of types, suppose `A` and `B` are types, and `I` is a type
    /// constructor. If `I` is invariant, then `I<A> <: I<B>` if and only if `A = B`.
    ///
    /// Example: `Dict<Integer, String> <: Dict<Number, String>` is not a subtype
    /// of the other, even though `Integer <: Number`.
    Invariant,
}

impl Variance {
    /// Computes the resulting variance when transitioning from one variance context to another.
    ///
    /// This function is used to determine the correct variance when composing type contexts,
    /// such as when nesting generic types or when traversing into subexpressions.
    ///
    /// The variance transition rules are as follows:
    ///
    /// | Context ↓ \ Parameter → | Covariant (+)     | Contravariant (–) | Invariant (0) |
    /// |-------------------------|-------------------|-------------------|---------------|
    /// | **Covariant (+)**       | Covariant (+)     | Contravariant (–) | Invariant (0) |
    /// | **Contravariant (–)**   | Contravariant (–) | Covariant (+)     | Invariant (0) |
    /// | **Invariant (0)**       | Invariant (0)     | Invariant (0)     | Invariant (0) |
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::r#type::environment::Variance;
    /// // Covariant to contravariant transitions to contravariant
    /// assert_eq!(
    ///     Variance::Covariant.transition(Variance::Contravariant),
    ///     Variance::Contravariant
    /// );
    ///
    /// // Anything with invariant becomes invariant
    /// assert_eq!(
    ///     Variance::Covariant.transition(Variance::Invariant),
    ///     Variance::Invariant
    /// );
    /// assert_eq!(
    ///     Variance::Invariant.transition(Variance::Covariant),
    ///     Variance::Invariant
    /// );
    /// ```
    #[must_use]
    pub const fn transition(self, next: Self) -> Self {
        match (self, next) {
            // When going from covariant to contravariant context or vice versa, flip to
            // contravariant
            (Self::Covariant, Self::Contravariant) | (Self::Contravariant, Self::Covariant) => {
                Self::Contravariant
            }

            // Double contravariance flips back to covariant
            (Self::Contravariant, Self::Contravariant) => Self::Covariant,

            // When either context is invariant, the result is invariant
            (Self::Invariant, _) | (_, Self::Invariant) => Self::Invariant,

            // Otherwise preserve the context
            (Self::Covariant, Self::Covariant) => next,
        }
    }
}

#[cfg(test)]
mod test {
    use super::Variance;

    #[test]
    fn covariant_transitions() {
        // Covariant -> Covariant remains Covariant
        assert_eq!(
            Variance::Covariant.transition(Variance::Covariant),
            Variance::Covariant
        );

        // Covariant -> Contravariant becomes Contravariant
        assert_eq!(
            Variance::Covariant.transition(Variance::Contravariant),
            Variance::Contravariant
        );

        // Covariant -> Invariant becomes Invariant
        assert_eq!(
            Variance::Covariant.transition(Variance::Invariant),
            Variance::Invariant
        );
    }

    #[test]
    fn contravariant_transitions() {
        // Contravariant -> Covariant becomes Contravariant (flips)
        assert_eq!(
            Variance::Contravariant.transition(Variance::Covariant),
            Variance::Contravariant
        );

        // Contravariant -> Contravariant becomes Covariant (double negation)
        assert_eq!(
            Variance::Contravariant.transition(Variance::Contravariant),
            Variance::Covariant
        );

        // Contravariant -> Invariant becomes Invariant
        assert_eq!(
            Variance::Contravariant.transition(Variance::Invariant),
            Variance::Invariant
        );
    }

    #[test]
    fn invariant_transitions() {
        // Invariant -> Covariant remains Invariant
        assert_eq!(
            Variance::Invariant.transition(Variance::Covariant),
            Variance::Invariant
        );

        // Invariant -> Contravariant remains Invariant
        assert_eq!(
            Variance::Invariant.transition(Variance::Contravariant),
            Variance::Invariant
        );

        // Invariant -> Invariant remains Invariant
        assert_eq!(
            Variance::Invariant.transition(Variance::Invariant),
            Variance::Invariant
        );
    }

    #[test]
    fn transition_symmetry() {
        // Test that Covariant -> Contravariant is the same as Contravariant -> Covariant
        assert_eq!(
            Variance::Covariant.transition(Variance::Contravariant),
            Variance::Contravariant.transition(Variance::Covariant)
        );
    }

    #[test]
    fn transition_with_invariant() {
        // Test that any transition involving Invariant results in Invariant
        for variance in [
            Variance::Covariant,
            Variance::Contravariant,
            Variance::Invariant,
        ] {
            assert_eq!(
                Variance::Invariant.transition(variance),
                Variance::Invariant
            );
            assert_eq!(
                variance.transition(Variance::Invariant),
                Variance::Invariant
            );
        }
    }

    #[test]
    fn multi_step_transitions() {
        // Test that multiple transitions work correctly

        // Covariant -> Contravariant -> Covariant = Contravariant
        let result = Variance::Covariant
            .transition(Variance::Contravariant)
            .transition(Variance::Covariant);
        assert_eq!(result, Variance::Contravariant);

        // Contravariant -> Contravariant -> Contravariant = Contravariant
        // (Contra -> Contra = Co, then Co -> Contra = Contra)
        let result = Variance::Contravariant
            .transition(Variance::Contravariant)
            .transition(Variance::Contravariant);
        assert_eq!(result, Variance::Contravariant);

        // Covariant -> Invariant -> Covariant = Invariant
        // (Invariant propagates through all transitions)
        let result = Variance::Covariant
            .transition(Variance::Invariant)
            .transition(Variance::Covariant);
        assert_eq!(result, Variance::Invariant);
    }

    #[test]
    fn double_double_contravariance() {
        // Double-double contravariance should cancel out and return to covariance

        // (Contra -> Contra) -> (Contra -> Contra) = Covariant
        let inner1 = Variance::Contravariant.transition(Variance::Contravariant); // = Covariant
        let inner2 = Variance::Contravariant.transition(Variance::Contravariant); // = Covariant
        let result = inner1.transition(inner2);
        assert_eq!(result, Variance::Covariant);
    }
}
