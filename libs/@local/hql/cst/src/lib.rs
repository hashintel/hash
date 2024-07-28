#![feature(allocator_api, box_into_boxed_slice)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod arena;
pub mod expr;
pub mod parse;
pub mod symbol;
pub mod r#type;
pub mod value;

use error_stack::Result;
use text_size::TextRange;

use self::{
    arena::Arena,
    expr::Expr,
    parse::json::{
        node::{NodeParseError, NodeParser},
        program::ProgramParser,
        ProgramParseError,
    },
};

pub trait Span {
    fn span(&self) -> TextRange;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Node<'arena, 'source> {
    pub expr: Expr<'arena, 'source>,
    pub span: TextRange,
}

impl<'arena, 'source> Node<'arena, 'source> {
    /// Deserialize an expression from a JSON string.
    ///
    /// # Errors
    ///
    /// Returns an error if the input is not valid JSON, or a malformed expression.
    pub fn from_str(arena: &'arena Arena, value: &'source str) -> Result<Self, NodeParseError> {
        NodeParser::new(arena).parse(value)
    }
}

impl Span for Node<'_, '_> {
    fn span(&self) -> TextRange {
        self.span
    }
}

pub struct Program<'arena, 'source> {
    pub nodes: arena::Vec<'arena, Node<'arena, 'source>>,
    pub span: TextRange,
}

impl<'arena, 'source> Program<'arena, 'source> {
    /// Deserialize a program from a JSON string.
    ///
    /// # Errors
    ///
    /// Returns an error if the input is not valid JSON, or a malformed program.
    pub fn from_str(arena: &'arena Arena, value: &'source str) -> Result<Self, ProgramParseError> {
        ProgramParser::new(arena).parse(value)
    }
}
