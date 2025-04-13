use pretty::RcDoc;

use super::{
    Type, TypeKind,
    error::type_mismatch,
    pretty_print::{BLUE, PrettyPrint, RecursionLimit},
    unify::UnificationContext,
};
use crate::arena::Arena;

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
    fn pretty(&self, _: &Arena<Type>, _: RecursionLimit) -> pretty::RcDoc<anstyle::Style> {
        RcDoc::text(self.as_str()).annotate(BLUE)
    }
}

pub(crate) fn unify_primitive(
    context: &mut UnificationContext,
    lhs: Type<PrimitiveType>,
    rhs: Type<PrimitiveType>,
) {
    if lhs.kind == rhs.kind {
        return;
    }

    match (lhs.kind, rhs.kind) {
        // Integer gets demoted to Number, if required
        (PrimitiveType::Number, PrimitiveType::Integer) => {
            context.arena.update(
                rhs.id,
                rhs.map(|_| TypeKind::Primitive(PrimitiveType::Number)),
            );
        }

        (PrimitiveType::Integer, PrimitiveType::Number) => {
            context.arena.update(
                lhs.id,
                lhs.map(|_| TypeKind::Primitive(PrimitiveType::Number)),
            );
        }

        _ => {
            // Create a helpful error message based on the specific type mismatch
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

            context.diagnostics.push(type_mismatch(
                context.source,
                &context.arena,
                &lhs,
                &rhs,
                help_message,
            ));

            // Mark both as errors, as to not propagate errors further
            context.mark_error(lhs.id);
            context.mark_error(rhs.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PrimitiveType;
    use crate::r#type::{
        TypeKind,
        primitive::unify_primitive,
        test::{instantiate, setup},
    };

    #[test]
    fn identical_primitives_unify() {
        let mut context = setup();

        let types = [
            PrimitiveType::Number,
            PrimitiveType::Integer,
            PrimitiveType::String,
            PrimitiveType::Boolean,
            PrimitiveType::Null,
        ];

        for r#type in types {
            let lhs = instantiate(&mut context, TypeKind::Primitive(r#type));
            let rhs = instantiate(&mut context, TypeKind::Primitive(r#type));

            let lhs = context.arena[lhs]
                .clone()
                .map(|kind| kind.as_primitive().expect("type should be a primitive"));
            let rhs = context.arena[rhs]
                .clone()
                .map(|kind| kind.as_primitive().expect("type should be a primitive"));

            unify_primitive(&mut context, lhs, rhs);

            assert!(
                context.diagnostics.is_empty(),
                "Failed to unify identical {type:?} types"
            );

            // going back into the arena
            let lhs = context.arena[lhs.id].clone();
            let rhs = context.arena[rhs.id].clone();

            assert_eq!(lhs.kind, rhs.kind);
        }
    }

    #[test]
    fn integer_number_promotion() {
        let mut context = setup();

        // Test Integer -> Number
        let int_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));
        let num_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let int = context.arena[int_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));
        let num = context.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));

        unify_primitive(&mut context, int, num);

        assert!(
            context.diagnostics.is_empty(),
            "Failed to promote Integer to Number"
        );
        assert!(
            matches!(
                context.arena[int_id].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            ),
            "Integer was not promoted to Number"
        );

        // Test Number -> Integer (should promote Integer to Number)
        let mut context = setup();
        let int_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));
        let num_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let int = context.arena[int_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));
        let num = context.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("type should be a primitive"));

        unify_primitive(&mut context, num, int);

        assert!(
            context.diagnostics.is_empty(),
            "Failed to handle Number with Integer"
        );
        assert!(
            matches!(
                context.arena[int_id].kind,
                TypeKind::Primitive(PrimitiveType::Number)
            ),
            "Integer was not promoted to Number in reverse case"
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
            let mut context = setup();

            let lhs_id = instantiate(&mut context, TypeKind::Primitive(lhs_type));
            let rhs_id = instantiate(&mut context, TypeKind::Primitive(rhs_type));

            let lhs = context.arena[lhs_id]
                .as_ref()
                .map(|kind| kind.as_primitive().expect("should be primitive"));
            let rhs = context.arena[rhs_id]
                .as_ref()
                .map(|kind| kind.as_primitive().expect("should be primitive"));

            unify_primitive(&mut context, lhs, rhs);

            assert_eq!(
                context.diagnostics.len(),
                1,
                "Expected error when unifying {description}"
            );

            // Verify both types are marked as errors
            assert!(
                matches!(context.arena[lhs_id].kind, TypeKind::Error),
                "Left type not marked as error for {description}"
            );

            assert!(
                matches!(context.arena[rhs_id].kind, TypeKind::Error),
                "Right type not marked as error for {description}"
            );
        }
    }

    #[test]
    fn error_messages() {
        let mut context = setup();

        // Test String + Number error message
        let str_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let num_id = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let str = context.arena[str_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("should be primitive"));
        let num = context.arena[num_id]
            .as_ref()
            .map(|kind| kind.as_primitive().expect("should be primitive"));

        unify_primitive(&mut context, str, num);

        let diagnostic = &context.diagnostics[0];
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
