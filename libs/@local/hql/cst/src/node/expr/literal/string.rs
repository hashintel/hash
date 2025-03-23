use hql_span::SpanId;
use hql_symbol::Symbol;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StringLiteral {
    pub span: SpanId,

    pub value: Symbol,
}

impl StringLiteral {
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.value.as_str()
    }
}
