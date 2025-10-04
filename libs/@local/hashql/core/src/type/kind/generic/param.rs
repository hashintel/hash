use pretty::RcDoc;

use super::GenericArgumentId;
use crate::{
    pretty::{ORANGE, PrettyPrint, PrettyPrintBoundary},
    r#type::environment::Environment,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}

impl<'heap> PrettyPrint<'heap, Environment<'heap>> for Param {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        let mut doc = RcDoc::text(format!("?{}", self.argument)).annotate(ORANGE);

        if boundary.config().resolve_substitutions
            && let Some(substitution) = env.substitution.argument(self.argument)
        {
            doc = doc.append(
                RcDoc::text("\u{ab}")
                    .append(boundary.pretty_type(env, substitution))
                    .append("\u{bb}")
                    .group(),
            );
        }

        doc
    }
}
