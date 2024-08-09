use core::{fmt, fmt::Display};

use ecow::EcoString;
use hql_span::SpanId;

use crate::Spanned;

// TODO: in the future we might want to use the bump arena here as well.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol {
    pub value: EcoString,
    pub span: SpanId,
}

impl Spanned for Symbol {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.value, f)
    }
}
