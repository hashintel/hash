use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    pretty_print::{ORANGE, PrettyPrint, RecursionLimit},
};
use crate::{arena::Arena, newtype, symbol::Ident};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument {
    id: GenericArgumentId,
    name: Ident,

    // The initial type constraint (if present), only used during instantiation and pretty-printing
    constraint: Option<TypeId>,

    r#type: TypeId,
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
