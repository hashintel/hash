use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    pretty_print::{ORANGE, PrettyPrint, RecursionLimit},
    unify::UnificationContext,
    unify_type,
};
use crate::{
    arena::Arena,
    newtype,
    symbol::{Ident, Symbol},
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument {
    pub id: GenericArgumentId,
    pub name: Ident,

    // The initial type constraint (if present), only used during instantiation and pretty-printing
    pub constraint: Option<TypeId>,

    pub r#type: TypeId,
}

impl PrettyPrint for GenericArgument {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        let mut doc = RcDoc::text(self.name.value.as_str()).annotate(ORANGE);

        if let Some(constraint) = self.constraint {
            doc = doc.append(
                RcDoc::text(":")
                    .append(RcDoc::line())
                    .append(limit.pretty(&arena[constraint], arena)),
            );
        }

        doc
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArguments(EcoVec<GenericArgument>);

impl GenericArguments {
    #[must_use]
    pub const fn new() -> Self {
        Self(EcoVec::new())
    }

    pub fn enter_scope(&self, context: &mut UnificationContext) {
        for argument in &self.0 {
            context.enter_generic_argument_scope(argument.id, argument.r#type);
        }
    }

    pub fn exit_scope(&self, context: &mut UnificationContext) {
        for argument in &self.0 {
            context.exit_generic_argument_scope(argument.id);
        }
    }
}

impl FromIterator<GenericArgument> for GenericArguments {
    fn from_iter<T: IntoIterator<Item = GenericArgument>>(iter: T) -> Self {
        Self(EcoVec::from_iter(iter))
    }
}

impl PrettyPrint for GenericArguments {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::nil()
        } else {
            RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        self.0.iter().map(|argument| argument.pretty(arena, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">"))
        }
    }
}

impl Default for GenericArguments {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,

    pub name: Symbol,
}

impl PrettyPrint for Param {
    fn pretty<'a>(&'a self, _: &'a Arena<Type>, _: RecursionLimit) -> RcDoc<'a, anstyle::Style> {
        RcDoc::text(self.name.as_str())
    }
}

pub(crate) fn unify_param_lhs(context: &mut UnificationContext, lhs: &Type<Param>, rhs: TypeId) {
    let Some(argument) = context.generic_argument(lhs.kind.argument) else {
        let diagnostic =
            super::error::generic_argument_not_found(context.source, lhs, lhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(lhs.id);
        return;
    };

    unify_type(context, argument, rhs);
}

pub(crate) fn unify_param_rhs(context: &mut UnificationContext, lhs: TypeId, rhs: &Type<Param>) {
    let Some(argument) = context.generic_argument(rhs.kind.argument) else {
        let diagnostic =
            super::error::generic_argument_not_found(context.source, rhs, rhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(rhs.id);
        return;
    };

    unify_type(context, lhs, argument);
}

pub(crate) fn unify_param(context: &mut UnificationContext, lhs: &Type<Param>, rhs: &Type<Param>) {
    let lhs_argument = if let Some(lhs_argument) = context.generic_argument(lhs.kind.argument) {
        Some(lhs_argument)
    } else {
        let diagnostic =
            super::error::generic_argument_not_found(context.source, lhs, lhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(lhs.id);

        None
    };

    let rhs_argument = if let Some(rhs_argument) = context.generic_argument(rhs.kind.argument) {
        Some(rhs_argument)
    } else {
        let diagnostic =
            super::error::generic_argument_not_found(context.source, rhs, rhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(rhs.id);

        None
    };

    let Some((lhs_argument, rhs_argument)) = Option::zip(lhs_argument, rhs_argument) else {
        return;
    };

    unify_type(context, lhs_argument, rhs_argument);
}
