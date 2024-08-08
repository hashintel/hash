use alloc::borrow::Cow;

use hql_cst_lex::Number;
use hql_span::SpanId;
use text_size::TextRange;

use crate::{arena, Spanned};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValueKind<'arena, 'source> {
    /// Represents a JSON null value
    Null,

    /// Represents a JSON boolean
    Bool(bool),

    /// Represents a JSON number, wether integer or floating point
    Number(Cow<'source, Number>),

    /// Represents a JSON string
    String(Cow<'source, str>),

    /// Represents a JSON array
    Array(arena::Vec<'arena, Value<'arena, 'source>>),

    /// Represents a JSON object
    Object(arena::HashMap<'arena, Cow<'source, str>, Value<'arena, 'source>>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Value<'arena, 'source> {
    pub kind: ValueKind<'arena, 'source>,
    pub span: SpanId,
}

impl Spanned for Value<'_, '_> {
    fn span(&self) -> SpanId {
        self.span
    }
}
