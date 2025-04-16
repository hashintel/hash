use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;

use crate::r#type::{Type, TypeId, pretty_print::PrettyPrint, recursion::RecursionDepthBoundary};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IntersectionType {
    pub variants: EcoVec<TypeId>,
}

impl PrettyPrint for IntersectionType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(&arena[variant], arena)),
            RcDoc::line()
                .append(RcDoc::text("&"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}
