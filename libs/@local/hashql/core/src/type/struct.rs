use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    generic_argument::GenericArguments,
    pretty_print::{PrettyPrint, RecursionLimit},
};
use crate::{arena::Arena, symbol::Ident};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructField {
    key: Ident,
    value: TypeId,
}

impl PrettyPrint for StructField {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text(self.key.value.as_str())
            .append(RcDoc::text(":"))
            .append(RcDoc::line())
            .append(limit.pretty(&arena[self.value], arena))
            .group()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructType {
    fields: EcoVec<StructField>,
    extends: EcoVec<TypeId>,

    args: GenericArguments,
}

impl PrettyPrint for StructType {
    fn pretty<'a>(
        &'a self,
        arena: &'a Arena<Type>,
        limit: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        if self.fields.is_empty() {
            RcDoc::text("(:)")
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields.iter().map(|field| field.pretty(arena, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(")"))
        }
    }
}
