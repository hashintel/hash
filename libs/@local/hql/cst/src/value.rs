use alloc::borrow::Cow;
use core::{
    borrow::Borrow,
    hash::{Hash, Hasher},
};

use hql_span::SpanId;
use json_number::Number;

use crate::{Spanned, arena};

/// Key of an object
///
/// This not only contains the value of the key, but also the span of the key, to properly guard
/// against duplicate keys at a later stage, indexing is done through value, therefore all
/// implementations of the key of the notable needed traits ([`PartialEq`], [`Eq`], [`Hash`],
/// [`Borrow`]) ignore the span.
#[derive(Debug, Clone)]
pub struct ObjectKey<'source> {
    pub span: SpanId,
    pub value: Cow<'source, str>,
}

impl PartialEq for ObjectKey<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

impl Eq for ObjectKey<'_> {}

impl Hash for ObjectKey<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.value.hash(state);
    }
}

impl Borrow<str> for ObjectKey<'_> {
    fn borrow(&self) -> &str {
        &self.value
    }
}

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
    Object(arena::HashMap<'arena, ObjectKey<'source>, Value<'arena, 'source>>),
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
