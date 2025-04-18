use pretty::RcDoc;

use crate::r#type::{
    TypeId, environment::Environment, pretty_print::PrettyPrint, recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct IntersectionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl PrettyPrint for IntersectionType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(env, variant)),
            RcDoc::line()
                .append(RcDoc::text("&"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}
