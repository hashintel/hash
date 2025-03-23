use core::{fmt, fmt::Display};

use ecow::EcoString;
use hql_span::SpanId;

use crate::Spanned;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ident {
    pub name: EcoString,
    pub span: SpanId,
}

impl Spanned for Ident {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Ident {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, fmt)
    }
}
