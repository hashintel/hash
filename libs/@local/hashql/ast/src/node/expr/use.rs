use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{id::NodeId, path::Path};

/// A binding for an imported symbol.
///
/// Represents a single item imported from a module, optionally with an alias.
/// When an alias is provided, the imported item will be available under the
/// new name within the scope.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UseBinding {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub alias: Option<Ident>,
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
    Named(heap::Vec<'heap, UseBinding>),
    Glob(Glob),
}

/// A module import expression in the HashQL Abstract Syntax Tree.
///
/// Represents a `use` declaration that imports symbols from another module
/// into the current scope. Imports can bring in specific named items or all
/// exported items from a module.
///
/// Imported symbols are only visible within the body expression.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// // Named Import
/// ["use", "math", {"#tuple": ["sin", "cos", "tan"]},
///     ["*",
///         ["sin", "angle"],
///         ["cos", "angle"]
///     ]
/// ]
///
/// // Named import with renaming
/// ["use", "math", {"#tuple": {"sin": "_", "cos": "cosine", "tan": "_"}},
///     ["*",
///         ["sin", "angle"],
///         ["cosine", "angle"]
///     ]
/// ]
///
/// // Glob import
/// ["use", "math", "*",
///     ["*",
///         ["sin", "angle"],
///         ["cos", "angle"]
///     ]
/// ]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// // Named import
/// use math::{sin, cos, tan} in
///   *(sin(angle), cos(angle))
///
/// // Import with renaming
/// use math::{sin, cos as cosine, tan} in
///   *(sin(angle), cosine(angle))
///
/// // Glob import
/// use math::* in
///   *(sin(angle), cos(angle))
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UseExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub path: Path<'heap>,
    pub kind: UseKind<'heap>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
