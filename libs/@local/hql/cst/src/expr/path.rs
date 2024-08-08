use core::fmt::{self, Display};

use winnow::{
    combinator::trace,
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    Parser, Stateful,
};

use super::Expr;
use crate::{
    arena::{Arena, Box},
    parse::string::separated_boxed1,
    symbol::{parse_symbol, ParseRestriction, Symbol},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Path<'arena>(Box<'arena, [Symbol]>);

impl Display for Path<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, symbol) in self.0.iter().enumerate() {
            if i > 0 {
                f.write_str("::")?;
            }

            Display::fmt(symbol, f)?;
        }

        Ok(())
    }
}

impl<'arena, 'source> From<Path<'arena>> for Expr<'arena, 'source> {
    fn from(path: Path<'arena>) -> Self {
        Self::Path(path)
    }
}
