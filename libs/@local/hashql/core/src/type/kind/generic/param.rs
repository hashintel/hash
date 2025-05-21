use pretty::RcDoc;

use super::GenericArgumentId;
use crate::{
    pretty::{ORANGE, PrettyPrint, PrettyRecursionBoundary},
    r#type::environment::Environment,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}

impl<'heap> PrettyPrint<'heap> for Param {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcDoc::text(format!("?{}", self.argument)).annotate(ORANGE)
    }
}
