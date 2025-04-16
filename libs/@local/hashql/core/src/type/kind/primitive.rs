use core::ops::Index;

use pretty::RcDoc;

use crate::r#type::{
    Type, TypeId,
    environment::UnificationEnvironment,
    error::type_mismatch,
    pretty_print::{BLUE, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

// TODO: in the future we should support refinements
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PrimitiveType {
    Number,
    Integer,
    String,
    Null,
    Boolean,
}

impl PrimitiveType {
    #[must_use]
    pub(crate) fn structurally_equivalent(self, other: Self) -> bool {
        self == other
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Number => "Number",
            Self::Integer => "Integer",
            Self::String => "String",
            Self::Null => "Null",
            Self::Boolean => "Boolean",
        }
    }
}

impl PrettyPrint for PrimitiveType {
    fn pretty(
        &self,
        _: &impl Index<TypeId, Output = Type>,
        _: RecursionDepthBoundary,
    ) -> pretty::RcDoc<anstyle::Style> {
        RcDoc::text(self.as_str()).annotate(BLUE)
    }
}

/// Unifies primitive types
///
/// In a covariant context, this checks if `rhs` is a subtype of `lhs`.
/// For primitives, the main subtyping relationship is Integer <: Number
/// (Integer is a subtype of Number).
pub(crate) fn unify_primitive(
    env: &mut UnificationEnvironment,
    lhs: Type<PrimitiveType>,
    rhs: Type<PrimitiveType>,
) {
    // If primitives are identical, they're compatible in any variance context
    if lhs.kind == rhs.kind {
        return;
    }

    match (lhs.kind, rhs.kind) {
        // Handle the Integer <: Number subtyping relationship
        (PrimitiveType::Number, PrimitiveType::Integer) => {
            // In covariant context: Integer (rhs) is a subtype of Number (lhs).
            // This is valid - Integer can be used where Number is expected
        }

        (PrimitiveType::Integer, PrimitiveType::Number) => {
            // In covariant context: Number (rhs) is NOT a subtype of Integer (lhs)
            // This is an error - Number cannot be used where Integer is expected
            let diagnostic = type_mismatch(
                env,
                &lhs,
                &rhs,
                Some(
                    "Expected an Integer but found a Number. While all Integers are Numbers, not \
                     all Numbers are Integers (e.g., decimals like 3.14).",
                ),
            );

            env.record_diagnostic(diagnostic);
        }

        _ => {
            // In covariant context: These primitive types have no subtyping relationship
            // Provide helpful conversion suggestions based on the specific type mismatch
            let help_message = match (lhs.kind, rhs.kind) {
                (PrimitiveType::Number | PrimitiveType::Integer, PrimitiveType::String) => Some(
                    "You can convert the number to a string using the \
                     `::core::number::to_string/1` or `::core::number::to_string/2` function",
                ),
                (PrimitiveType::String, PrimitiveType::Number | PrimitiveType::Integer) => Some(
                    "You can convert the string to a number using the `::core::number::parse/1` \
                     or `::core::number::parse/2` function",
                ),
                (PrimitiveType::Boolean, PrimitiveType::String) => Some(
                    "You can convert the boolean to a string using the \
                     `::core::boolean::to_string/1` function",
                ),
                (PrimitiveType::String, PrimitiveType::Boolean) => Some(
                    "You can convert the string to a boolean using the `::core::boolean::parse/1` \
                     function",
                ),
                (PrimitiveType::Boolean, PrimitiveType::Number | PrimitiveType::Integer) => Some(
                    "You can convert the boolean to a number using the \
                     `::core::number::from_boolean/1` function",
                ),
                (PrimitiveType::Number | PrimitiveType::Integer, PrimitiveType::Boolean) => Some(
                    "You can convert the number to a boolean using the \
                     `::core::boolean::from_number/1` function",
                ),
                (PrimitiveType::Null, _) | (_, PrimitiveType::Null) => Some(
                    "Null cannot be combined with other types. Consider using optional types or a \
                     null check.",
                ),
                _ => None,
            };

            // Record a type mismatch diagnostic with helpful conversion suggestions
            let diagnostic = type_mismatch(env, &lhs, &rhs, help_message);
            env.record_diagnostic(diagnostic);
        }
    }
}

pub(crate) fn intersection_primitive(
    lhs: PrimitiveType,
    rhs: PrimitiveType,
) -> Option<PrimitiveType> {
    if lhs == rhs {
        return Some(lhs);
    }

    // subtyping relationship, `Integer <: Number`
    match (lhs, rhs) {
        (PrimitiveType::Integer, PrimitiveType::Number)
        | (PrimitiveType::Number, PrimitiveType::Integer) => Some(PrimitiveType::Integer),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::PrimitiveType;
    use crate::r#type::{
        kind::{TypeKind, primitive::unify_primitive},
        test::{instantiate, setup_unify},
    };

    #[test]
    fn identical_primitives_unify() {
        setup_unify!(env);

        let types = [
            PrimitiveType::Number,
            PrimitiveType::Integer,
            PrimitiveType::String,
            PrimitiveType::Boolean,
            PrimitiveType::Null,
        ];

        for r#type in types {
            let lhs = instantiate(&mut env, TypeKind::Primitive(r#type));
            let rhs = instantiate(&mut env, TypeKind::Primitive(r#type));

            let lhs = env.arena[lhs]
                .clone()
                .map(|kind| kind.as_primitive().expect("type should be a primitive"));
            let rhs = env.arena[rhs]
                .clone()
                .map(|kind| kind.as_primitive().expect("type should be a primitive"));

            unify_primitive(&mut env, lhs, rhs);

            assert!(
                env.take_diagnostics().is_empty(),
                "Failed to unify identical {type:?} types"
            );

            // going back into the arena
            let lhs = env.arena[lhs.id].clone();
            let rhs = env.arena[rhs.id].clone();

            assert_eq!(lhs.kind, rhs.kind);
        }
    }

    #[test]
    fn integer_number_promotion() {
        setup_unify!(env);

        // Test Number as expected type (lhs) with Integer as actual type (rhs)
        // In covariant context, this should succeed (Integer is a subtype of Number)
        let num_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let int_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let num = env.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));
        let int = env.arena[int_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));

        unify_primitive(&mut env, num, int);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to accept Integer where Number was expected"
        );
        assert!(
            matches!(
                env.arena[int_id].kind,
                TypeKind::Primitive(PrimitiveType::Integer)
            ),
            "Integer was not promoted to Number"
        );
    }

    #[test]
    fn integer_number_mismatch() {
        // Test Integer as expected type (lhs) with Number as actual type (rhs)
        // In covariant context, this should fail (Number is not a subtype of Integer)
        setup_unify!(env);
        let int_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let num_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let int = env.arena[int_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));
        let num = env.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));

        unify_primitive(&mut env, int, num);

        // Should produce a diagnostic error
        assert_eq!(
            env.take_diagnostics().len(),
            1,
            "Expected error when using Number where Integer is required"
        );
    }

    #[test]
    fn incompatible_primitives() {
        let test_cases = [
            (
                PrimitiveType::String,
                PrimitiveType::Number,
                "string and number",
            ),
            (
                PrimitiveType::String,
                PrimitiveType::Boolean,
                "string and boolean",
            ),
            (
                PrimitiveType::Number,
                PrimitiveType::Boolean,
                "number and boolean",
            ),
            (
                PrimitiveType::Null,
                PrimitiveType::String,
                "null and string",
            ),
            (
                PrimitiveType::Null,
                PrimitiveType::Number,
                "null and number",
            ),
            (
                PrimitiveType::Null,
                PrimitiveType::Boolean,
                "null and boolean",
            ),
        ];

        for (lhs_type, rhs_type, description) in test_cases {
            setup_unify!(env);

            let lhs_id = instantiate(&mut env, TypeKind::Primitive(lhs_type));
            let rhs_id = instantiate(&mut env, TypeKind::Primitive(rhs_type));

            let lhs = env.arena[lhs_id]
                .as_ref()
                .map(|kind| kind.as_primitive().expect("should be primitive"));
            let rhs = env.arena[rhs_id]
                .as_ref()
                .map(|kind| kind.as_primitive().expect("should be primitive"));

            unify_primitive(&mut env, lhs, rhs);

            assert_eq!(
                env.take_diagnostics().len(),
                1,
                "Expected error when unifying {description}"
            );
        }
    }

    #[test]
    fn error_messages() {
        setup_unify!(env);

        // Test String + Number error message
        let str_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let num_id = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let str = env.arena[str_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("should be primitive"));
        let num = env.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("should be primitive"));

        unify_primitive(&mut env, str, num);

        let diagnostic = &env.take_diagnostics()[0];
        assert_eq!(
            diagnostic
                .help
                .as_ref()
                .expect("help should be present")
                .message(),
            "You can convert the string to a number using the `::core::number::parse/1` or \
             `::core::number::parse/2` function"
        );
    }
}
