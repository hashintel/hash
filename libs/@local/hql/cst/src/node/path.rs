use core::fmt::Display;

use hql_span::SpanId;

use super::generic::Generic;
use crate::{Spanned, heap::P, node::ident::Ident};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PathSegment<'heap> {
    pub ident: Ident,
    // Type parameters attached to this path
    pub args: P<'heap, [Generic<'heap>]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Path<'heap> {
    pub span: SpanId,

    pub segments: P<'heap, [Ident]>,
}

impl Spanned for Path<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Path<'_> {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let Some((first, rest)) = self.segments.split_first() else {
            return Ok(());
        };

        Display::fmt(first, fmt)?;
        for segment in rest {
            fmt.write_str("::")?;
            Display::fmt(segment, fmt)?;
        }

        Ok(())
    }
}
