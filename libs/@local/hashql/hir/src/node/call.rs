use hashql_core::{intern::Interned, span::SpanId};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Call<'heap> {
    pub span: SpanId,

    pub function: Interned<'heap, Node<'heap>>,
    pub arguments: Interned<'heap, [Node<'heap>]>,
    // ^ labeled arguments are resolved at an earlier stage
}
