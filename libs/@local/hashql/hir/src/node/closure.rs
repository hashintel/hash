use hashql_core::{
    intern::Interned,
    span::SpanId,
    r#type::{
        TypeId,
        environment::Environment,
        kind::{Apply, ClosureType, Generic, TypeKind},
    },
};

use super::{Node, r#let::Binder};

pub(crate) fn extract_signature<'heap>(
    mut type_id: TypeId,
    env: &Environment<'heap>,
) -> &'heap ClosureType<'heap> {
    loop {
        let kind = env.r#type(type_id).kind;

        match kind {
            &TypeKind::Apply(Apply { base, .. }) | &TypeKind::Generic(Generic { base, .. }) => {
                type_id = base;
            }
            TypeKind::Closure(closure) => return closure,
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Union(_)
            | TypeKind::Intersection(_)
            | TypeKind::Param(_)
            | TypeKind::Infer(_)
            | TypeKind::Never
            | TypeKind::Unknown => {
                unreachable!("ClosureSignature::returns() called on a non-closure type")
            }
        }
    }
}

pub(crate) fn extract_signature_generic<'heap>(
    mut type_id: TypeId,
    env: &Environment<'heap>,
) -> Option<&'heap Generic<'heap>> {
    loop {
        let kind = env.r#type(type_id).kind;

        match kind {
            &TypeKind::Apply(Apply { base, .. }) => {
                type_id = base;
            }
            TypeKind::Generic(generic) => return Some(generic),
            TypeKind::Closure(_) => return None,
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Union(_)
            | TypeKind::Intersection(_)
            | TypeKind::Param(_)
            | TypeKind::Infer(_)
            | TypeKind::Never
            | TypeKind::Unknown => {
                unreachable!("ClosureSignature::returns() called on a non-closure type")
            }
        }
    }
}

pub(crate) fn extract_signature_returns<'heap>(
    type_id: TypeId,
    env: &Environment<'heap>,
) -> TypeId {
    extract_signature(type_id, env).returns
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureParam<'heap> {
    pub span: SpanId,

    // see: https://linear.app/hash/issue/H-4587/hashql-add-argument-label-support-a-la-swift
    // pub label: Option<Ident<'heap>>,
    pub name: Binder<'heap>,
}

/// The signature of a closure in the HashQL HIR.
///
/// Defines the interface of a closure function, including its parameters and return type.
/// The signature provides all type information necessary for type checking and validation
/// of the closure.
///
/// Note that parameter names are stored separately from the type information in the `params`
/// field, as the type system only tracks parameter types, not their names.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureSignature<'heap> {
    pub span: SpanId,

    // // Always a `ClosureType`, or a type wrapped in `Generic`
    // pub def: TypeDef<'heap>,

    // The names of the different parameters, always the same length as the `ClosureType` params
    pub params: Interned<'heap, [ClosureParam<'heap>]>,
}

/// A closure expression in the HashQL HIR.
///
/// Represents an anonymous function with a signature and a body expression.
/// Closures in HashQL can capture variables from their surrounding scope.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Closure<'heap> {
    pub signature: ClosureSignature<'heap>,
    pub body: Node<'heap>,
}
