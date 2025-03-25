use core::{fmt, fmt::Display};

use hql_core::{span::SpanId, symbol::Ident};

use super::{generic::Generic, id::NodeId};
use crate::heap::P;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PathSegment<'heap> {
    pub id: NodeId,

    pub ident: Ident,
    // Type parameters attached to this path
    pub args: P<'heap, [Generic<'heap>]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Path<'heap> {
    pub span: SpanId,

    pub segments: P<'heap, [Ident]>,
}

impl Display for Path<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
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
