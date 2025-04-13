// HashQL type system

pub mod error;
pub mod generic_argument;
pub mod intrinsic;
pub mod pretty_print;
pub mod primitive;
pub mod r#struct;
#[cfg(test)]
pub(crate) mod test;
pub mod unify;

use pretty::RcDoc;

use self::{
    error::expected_never,
    intrinsic::{IntrinsicType, unify_intrinsic},
    pretty_print::{CYAN, GRAY, PrettyPrint, RED, RecursionLimit},
    primitive::{PrimitiveType, unify_primitive},
    r#struct::{StructType, unify_struct},
    unify::UnificationContext,
};
use crate::{arena::Arena, id::HasId, newtype, span::SpanId};

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TupleType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct OpaqueType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {}

pub struct GenericArgument {}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind {
    Closure(ClosureType),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),
    Struct(StructType),
    Tuple(TupleType),
    Opaque(OpaqueType),
    Union(UnionType),
    Param(Param),
    Never,
    Unknown,
    Infer,
    // This type is linked / the same type as another, only happens on infer chains
    Link(TypeId),
    Error,
}

impl TypeKind {
    #[must_use]
    pub const fn as_primitive(&self) -> Option<PrimitiveType> {
        match self {
            &Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_intrinsic(&self) -> Option<IntrinsicType> {
        match self {
            &Self::Intrinsic(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_struct(self) -> Option<StructType> {
        match self {
            Self::Struct(r#type) => Some(r#type),
            _ => None,
        }
    }
}

impl PrettyPrint for TypeKind {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        match self {
            Self::Primitive(primitive) => primitive.pretty(arena, limit),
            Self::Intrinsic(intrinsic) => intrinsic.pretty(arena, limit),
            Self::Struct(r#struct) => r#struct.pretty(arena, limit),
            Self::Link(id) => arena[*id].pretty(arena, limit),
            Self::Infer => RcDoc::text("_").annotate(GRAY),
            Self::Unknown => RcDoc::text("?").annotate(CYAN),
            Self::Never => RcDoc::text("!").annotate(CYAN),
            Self::Error => RcDoc::text("<<ERROR>>").annotate(RED),
            _ => todo!(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Type<K = TypeKind> {
    id: TypeId,
    span: SpanId,

    kind: K,
}

impl<K> Type<K> {
    pub fn map<K2>(self, closure: impl FnOnce(K) -> K2) -> Type<K2> {
        Type {
            id: self.id,
            span: self.span,
            kind: closure(self.kind),
        }
    }

    pub const fn as_ref(&self) -> Type<&K> {
        Type {
            id: self.id,
            span: self.span,
            kind: &self.kind,
        }
    }
}

impl<K> PrettyPrint for Type<K>
where
    K: PrettyPrint,
{
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        self.kind.pretty(arena, limit)
    }
}

impl HasId for Type {
    type Id = TypeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

#[expect(clippy::too_many_lines)]
pub(crate) fn unify_type(context: &mut UnificationContext, lhs: TypeId, rhs: TypeId) {
    if context.visit(lhs, rhs) {
        // We've detected a circular reference in the type graph
        let lhs_type = &context.arena[lhs];
        let rhs_type = &context.arena[rhs];

        let diagnostic = error::circular_type_reference(context.source, lhs_type, rhs_type);

        context.record_diagnostic(diagnostic);
        context.mark_error(lhs);
        context.mark_error(rhs);
        return;
    }

    let lhs = &context.arena[lhs];
    let rhs = &context.arena[rhs];

    let lhs_id = lhs.id;
    let rhs_id = rhs.id;

    if lhs.id == rhs.id {
        return;
    }

    #[expect(clippy::match_same_arms, reason = "makes the intent clear")]
    match (&lhs.kind, &rhs.kind) {
        (&TypeKind::Link(lhs_id), &TypeKind::Link(rhs_id)) => {
            unify_type(context, lhs_id, rhs_id);
        }
        (&TypeKind::Link(lhs_id), _) => {
            unify_type(context, lhs_id, rhs.id);
        }
        (_, &TypeKind::Link(rhs_id)) => {
            unify_type(context, lhs.id, rhs_id);
        }

        (TypeKind::Infer, TypeKind::Infer) => {
            let rhs_id = rhs.id;

            // If both are inferred, quantum-entangle them, meaning lhs points to rhs
            context
                .arena
                .update_with(lhs.id, |lhs| lhs.kind = TypeKind::Link(rhs_id));
        }
        (TypeKind::Infer, rhs) => {
            let rhs = rhs.clone();

            // Infer simply propagate the rhs type
            context
                .arena
                .update_with(lhs.id, |lhs| lhs.kind = rhs.clone());
        }
        (lhs, TypeKind::Infer) => {
            let lhs = lhs.clone();

            // Infer simply propagate the lhs type
            context
                .arena
                .update_with(rhs.id, |rhs| rhs.kind = lhs.clone());
        }

        (TypeKind::Error, TypeKind::Error) => {
            // Both are compatible with each other
        }
        (TypeKind::Error, _) => {
            // do nothing, simply propagate the error up
            context.mark_error(rhs.id);
        }
        (_, TypeKind::Error) => {
            // do nothing, simply propagate the error up
            context.mark_error(lhs.id);
        }

        (&TypeKind::Primitive(lhs_kind), &TypeKind::Primitive(rhs_kind)) => {
            unify_primitive(
                context,
                lhs.as_ref().map(|_| lhs_kind),
                rhs.as_ref().map(|_| rhs_kind),
            );
        }

        (&TypeKind::Intrinsic(lhs_kind), &TypeKind::Intrinsic(rhs_kind)) => {
            unify_intrinsic(
                context,
                lhs.as_ref().map(|_| lhs_kind),
                rhs.as_ref().map(|_| rhs_kind),
            );
        }

        (TypeKind::Struct(lhs_kind), TypeKind::Struct(rhs_kind)) => {
            unify_struct(
                context,
                lhs.as_ref().map(|_| lhs_kind.clone()),
                rhs.as_ref().map(|_| rhs_kind.clone()),
            );
        }

        (TypeKind::Never, TypeKind::Never) => {
            // Both are never, so they are compatible
        }
        (TypeKind::Never, _) => {
            let diagnostic = expected_never(lhs.span, &context.arena, rhs);

            // Mark as error since it should have been Never type
            context
                .arena
                .update_with(rhs.id, |rhs| rhs.kind = TypeKind::Error);

            context.record_diagnostic(diagnostic);
        }
        (_, TypeKind::Never) => {
            let diagnostic = expected_never(rhs.span, &context.arena, lhs);

            // Mark as error since it should have been Never type
            context
                .arena
                .update_with(lhs.id, |lhs| lhs.kind = TypeKind::Error);

            context.record_diagnostic(diagnostic);
        }

        (TypeKind::Unknown, TypeKind::Unknown) => {
            // Both are unknown, so they are compatible
        }
        (TypeKind::Unknown, rhs) => {
            // unknown is the top type, therefore lhs turns into rhs
            let rhs = rhs.clone();
            context.arena.update_with(lhs.id, |lhs| lhs.kind = rhs);
        }
        (lhs, TypeKind::Unknown) => {
            // unknown is the top type, therefore rhs turns into lhs
            let lhs = lhs.clone();
            context.arena.update_with(rhs.id, |rhs| rhs.kind = lhs);
        }

        _ => {
            todo!(
                "{} with {}",
                lhs.pretty_print(&context.arena, 80),
                rhs.pretty_print(&context.arena, 80)
            );
        }
    }

    context.leave(lhs_id, rhs_id);
}
