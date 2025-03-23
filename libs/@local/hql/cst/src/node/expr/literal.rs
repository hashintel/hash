use ecow::{EcoString, EcoVec};
use hql_span::SpanId;

use crate::{Spanned, heap::P, node::r#type::Type};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NumberBuffer(EcoVec<u8>);

impl NumberBuffer {
    pub fn new(value: impl Into<EcoVec<u8>>) -> Self {
        NumberBuffer(value.into())
    }
}

impl AsRef<[u8]> for NumberBuffer {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
    }
}

/// SAFETY: we just proxy to `EcoVec`
#[expect(
    unsafe_code,
    reason = "simply proxying to `EcoVec` and contract is implemented"
)]
unsafe impl json_number::Buffer for NumberBuffer {
    fn from_bytes(bytes: &[u8]) -> Self {
        NumberBuffer(EcoVec::from(bytes))
    }

    fn from_vec(bytes: Vec<u8>) -> Self {
        NumberBuffer(EcoVec::from(bytes))
    }
}

/// Type alias for JSON-compatible number representation using `EcoVec` as the underlying buffer.
///
/// Uses `json_number::NumberBuf` with `EcoVec<u8>` since `EcoVec` doesn't support the `Allocator`
/// trait yet.
pub type Number = json_number::NumberBuf<NumberBuffer>;

/// Type alias for string literals in the CST, using `EcoString` for efficient memory usage.
pub type String = EcoString;

/// Represents the different kinds of literal values in the language.
///
/// Each variant represents a specific type of literal that can appear in expressions.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum LiteralKind {
    /// Represents a null value.
    Null,
    /// Represents a boolean value (true or false).
    Boolean(bool),
    /// Represents a numeric literal.
    Number(Number),
    /// Represents a string literal.
    String(String),
}

/// Represents a literal expression in the concrete syntax tree.
///
/// A literal is a direct representation of a value in the source code, such as
/// numbers, strings, booleans, etc. Each literal has a specific kind and a
/// span that tracks its location in the source code.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LiteralExpr<'heap> {
    pub span: SpanId,

    pub kind: LiteralKind,
    pub r#type: P<'heap, Type<'heap>>,
}

impl Spanned for LiteralExpr<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}
