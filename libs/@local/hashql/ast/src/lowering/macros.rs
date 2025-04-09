use hashql_core::{
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::node::{
    id::NodeId,
    path::{Path, PathSegment},
};

/// Creates a `Symbol` with the given identifier or literal.
///
/// # Examples
///
/// Using an identifier:
/// ```ignore
/// let sym = symbol!(kernel); // Creates a Symbol containing "kernel"
/// ```
///
/// Using a string literal:
/// ```ignore
/// let sym = symbol!("kernel::type"); // Creates a Symbol containing "kernel::type"
/// ```
macro symbol {
    ($value:ident) => {
        Symbol::new(stringify!($value))
    },

    ($value:literal) => {
        Symbol::new($value)
    }
}

/// Creates an `Ident` with the given identifier or literal.
///
/// All identifiers created by this macro have a synthetic span and appropriate kind:
/// - Identifiers use `IdentKind::Lexical`
/// - String literals use `IdentKind::Symbol`
///
/// # Examples
///
/// Using an identifier:
/// ```ignore
/// let id = ident!(kernel); // Creates a lexical identifier "kernel"
/// ```
///
/// Using a string literal:
/// ```ignore
/// let id = ident!("+"); // Creates a symbol identifier "+"
/// ```
macro ident {
    ($value:ident) => {
        Ident {
            span: SpanId::SYNTHETIC,
            value: symbol!($value),
            kind: IdentKind::Lexical,
        }
    },

    ($value:literal) => {
        Ident {
            span: SpanId::SYNTHETIC,
            value: symbol!($value),
            kind: IdentKind::Symbol,
        }
    }
}

/// Creates a rooted `Path` with the given segments.
///
/// This macro generates a fully qualified path with synthetic spans for all components.
/// Each segment in the path is separated by the `::` token in the macro invocation.
///
/// # Examples
///
/// ```ignore
/// let kernel_path = path!(heap; kernel::special_form::let);
/// // Creates a path equivalent to "::kernel::special_form::let"
/// ```
macro path($heap:expr; ::$($segment:tt)::*) {
    Path {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        rooted: true,
        segments: {
            let mut vec = $heap.vec(Some(1 + ${count($segment)}));

            $(
                vec.push(PathSegment {
                    id: NodeId::PLACEHOLDER,
                    span: SpanId::SYNTHETIC,
                    name: ident!($segment),
                    arguments: $heap.vec(None),
                });
            )+

            vec
        },
    }
}

/// Populates a name mapping with multiple key-path pairs.
///
/// This macro takes a name mapping, a heap, and a list of key-path pairs to insert.
/// Each key is mapped to a fully qualified path constructed using the `path!` macro.
///
/// # Examples
///
/// ```ignore
/// mapping!(self.mapping, self.heap; [
///     let => ::kernel::special_form::let,
///     "+" => ::math::add
/// ]);
/// ```
///
/// This adds two mappings:
/// - The symbol "let" maps to the path "`::kernel::special_form::let`"
/// - The symbol "+" maps to the path "`::math::add`"
pub(crate) macro mapping($mapping:expr, $heap:expr; [$($key:tt => ::$($segment:tt)::*),* $(,)?]) {
    $(
        $mapping.insert(symbol!($key), path!($heap; ::$($segment)::*));
    )*
}
