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
                (PrimitiveType::Number | PrimitiveType::Integer, PrimitiveType::String) => {
                    Some("Convert the number to a string using string conversion functions")
                }
                (PrimitiveType::String, PrimitiveType::Number | PrimitiveType::Integer) => {
                    Some("Convert the string to a number using number parsing functions")
                }
                (PrimitiveType::Boolean, PrimitiveType::String) => {
                    Some("Convert the boolean to a string using string conversion functions")
                }
                (PrimitiveType::String, PrimitiveType::Boolean) => {
                    Some("Convert the string to a boolean using boolean parsing functions")
                }
                (PrimitiveType::Boolean, PrimitiveType::Number | PrimitiveType::Integer) => {
                    Some("Convert the boolean to a number (1 for true, 0 for false)")
                }
                (PrimitiveType::Number | PrimitiveType::Integer, PrimitiveType::Boolean) => {
                    Some("Convert the number to a boolean (non-zero is true, zero is false)")
                }
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
            context.arena.update(lhs.id, lhs.map(|_| TypeKind::Error));
            context.arena.update(rhs.id, rhs.map(|_| TypeKind::Error));
        }
    }
}
