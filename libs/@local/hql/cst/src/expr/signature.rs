use core::{fmt, fmt::Display};

use winnow::{
    combinator::{delimited, opt, preceded, separated_pair, trace},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use super::Expr;
use crate::{
    arena::{self, Arena},
    parse::string,
    symbol::{self, parse_symbol, Symbol},
    r#type::{parse_type, Type},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature<'arena> {
    pub generics: arena::Box<'arena, [Generic<'arena>]>,

    pub arguments: arena::Box<'arena, [Argument<'arena>]>,

    pub r#return: Return<'arena>,
}

impl<'a> Display for Signature<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if !self.generics.is_empty() {
            f.write_str("<")?;
            for (index, generic) in self.generics.iter().enumerate() {
                if index > 0 {
                    f.write_str(", ")?;
                }

                Display::fmt(generic, f)?;
            }
            f.write_str(">")?;
        }

        f.write_str("(")?;

        for (index, argument) in self.arguments.iter().enumerate() {
            if index > 0 {
                f.write_str(", ")?;
            }

            Display::fmt(argument, f)?;
        }

        f.write_str(") -> ")?;

        Display::fmt(&self.r#return, f)
    }
}

impl<'arena, 'source> From<Signature<'arena>> for Expr<'arena, 'source> {
    fn from(signature: Signature<'arena>) -> Self {
        Self::Signature(signature)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generic<'a> {
    pub name: Symbol,
    pub bound: Option<Type<'a>>,
}

impl<'a> Display for Generic<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, f)?;

        if let Some(bound) = &self.bound {
            f.write_str(": ")?;
            Display::fmt(bound, f)
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Argument<'a> {
    pub name: Symbol,
    pub r#type: Type<'a>,
}

impl<'a> Display for Argument<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, f)?;
        f.write_str(": ")?;
        Display::fmt(&self.r#type, f)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Return<'a> {
    pub r#type: Type<'a>,
}

impl<'a> Display for Return<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.r#type, f)
    }
}
