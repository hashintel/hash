use hashql_core::{heap, span::SpanId, symbol::Ident};

use crate::node::id::NodeId;

/// A binding for an imported symbol.
///
/// Represents a single item imported from a module, optionally with an alias.
/// When an alias is provided, the imported item will be available under the
/// new name within the scope.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UseBinding<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub alias: Option<Ident<'heap>>,
}

/// A glob import marker.
///
/// Represents a wildcard import that brings all exported symbols from a module
/// into the current scope.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Glob {
    pub id: NodeId,
    pub span: SpanId,
}

/// The kind of import being performed.
///
/// Determines whether specific named items are being imported or if all
/// items are being imported with a glob.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum UseKind<'heap> {
    Named(heap::Vec<'heap, UseBinding<'heap>>),
    Glob(Glob),
}
