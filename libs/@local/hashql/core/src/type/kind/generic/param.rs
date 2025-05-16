use pretty::RcDoc;

use super::GenericArgumentId;
use crate::r#type::{
    environment::Environment,
    pretty_print::{ORANGE, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}

impl PrettyPrint for Param {
    fn pretty<'env>(
        &self,
        _: &'env Environment,
        _: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text(format!("?{}", self.argument)).annotate(ORANGE)
    }
}
