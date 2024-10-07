use core::fmt::{self, Display};

use hql_span::SpanId;

use super::ExprKind;
use crate::{Spanned, arena, symbol::Symbol};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Path<'arena> {
    pub segments: arena::Box<'arena, [Symbol]>,

    pub span: SpanId,
}

impl Spanned for Path<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Path<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, symbol) in self.segments.iter().enumerate() {
            if i > 0 {
                fmt.write_str("::")?;
            }

            Display::fmt(symbol, fmt)?;
        }

        Ok(())
    }
}

impl<'arena, 'source> From<Path<'arena>> for ExprKind<'arena, 'source> {
    fn from(path: Path<'arena>) -> Self {
        Self::Path(path)
    }
}
