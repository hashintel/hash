use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    pretty_print::{ORANGE, PrettyPrint, RecursionLimit},
    unify::UnificationContext,
};
use crate::{arena::Arena, newtype, symbol::Ident};

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
