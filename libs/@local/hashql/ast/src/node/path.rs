use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::{
    generic::{GenericArgument, GenericConstraint},
    id::NodeId,
};

/// Represents an argument within the angle brackets of a path segment.
///
/// This enum distinguishes between standard generic type arguments (like `String`
/// in `Vec<String>`) and generic constraints when they appear directly
/// within the path segment's arguments list (e.g., potentially in generic
/// function calls or specific type contexts).
///
/// # Examples
///
/// For a path segment like `HashMap<K, V>`:
/// - `K` would be `PathSegmentArgument::Argument`
/// - `V` would be `PathSegmentArgument::Argument`
///
/// For a path segment like `process<T: Debug>`:
/// - `T: Debug` would be `PathSegmentArgument::Constraint`
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum PathSegmentArgument<'heap> {
    /// A standard generic type argument (e.g., `String`, `T`).
    Argument(GenericArgument<'heap>),
    /// A generic constraint specified within the argument list (e.g., `T: Debug`).
    Constraint(GenericConstraint<'heap>),
}

impl PathSegmentArgument<'_> {
    #[must_use]
    pub const fn span(&self) -> SpanId {
        match self {
            PathSegmentArgument::Argument(argument) => argument.span,
            PathSegmentArgument::Constraint(constraint) => constraint.span,
        }
    }
}

/// A segment in a path expression.
///
/// Represents a single component of a qualified path, consisting of an identifier
/// and optional generic type arguments. Path segments are connected to form
/// complete paths like `module::submodule::item<T>`.
///
/// # Examples
///
/// In a path like `std::collections::HashMap<K, V>`:
/// - `std` is a segment with no generic arguments
/// - `collections` is a segment with no generic arguments
/// - `HashMap` is a segment with generic arguments `K` and `V`
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PathSegment<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    /// Type parameters attached to this path segment.
    pub arguments: heap::Vec<'heap, PathSegmentArgument<'heap>>,
}

/// A path expression in the HashQL Abstract Syntax Tree.
///
/// Represents a qualified reference to a variable, function, type, or module.
/// Paths can be simple identifiers (like `x`) or qualified names with multiple
/// segments separated by double colons (like `std::collections::HashMap`).
///
/// Path expressions are used for variable references, module access, and type names.
/// They can include generic type arguments applied to specific segments.
///
/// # Examples
///
/// Simple paths:
/// ```text
/// x                     // A local variable
/// length                // A function or variable
/// ```
///
/// Qualified paths:
/// ```text
/// std::collections::HashMap  // An item in a nested module
/// math::sin                  // A function in a module
/// ```
///
/// Paths with generic arguments:
/// ```text
/// Vec<Int>                       // A type with one type argument
/// HashMap<String, User>          // A type with two type arguments
/// graph::query<User, Connection> // A generic function
/// ```
///
/// J-Expr explicit:
/// ```json
/// {"#path", ["std", "collections", "HashMap"]}
/// {"#path", [{"name": "HashMap", "arguments": ["K, V"]}]}
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Path<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    /// Whether the path is rooted (starts with a double colon `::`).
    pub rooted: bool,
    pub segments: heap::Vec<'heap, PathSegment<'heap>>,
}

impl<'heap> Path<'heap> {
    const fn is_generic_ident(&self) -> bool {
        if self.rooted {
            return false;
        }

        if self.segments.len() != 1 {
            return false;
        }

        true
    }

    // Check if the path is a single identifier, guarantees that there's at least one segment
    const fn is_ident(&self) -> bool {
        if !self.is_generic_ident() {
            return false;
        }

        let [segment] = self.segments.as_slice() else {
            unreachable!();
        };

        if !segment.arguments.is_empty() {
            return false;
        }

        true
    }

    pub(crate) fn has_generic_arguments(&self) -> bool {
        self.segments
            .iter()
            .any(|segment| !segment.arguments.is_empty())
    }

    // Check if the path is a single identifier, and return if that's the case
    pub(crate) fn as_ident(&self) -> Option<&Ident<'heap>> {
        if !self.is_ident() {
            return None;
        }

        let segment = &self.segments[0];

        Some(&segment.name)
    }

    #[must_use]
    pub fn as_generic_ident(&self) -> Option<(Ident<'heap>, &[PathSegmentArgument<'heap>])> {
        if !self.is_generic_ident() {
            return None;
        }

        let segment = &self.segments[0];

        Some((segment.name, &segment.arguments))
    }

    pub(crate) fn into_ident(mut self) -> Option<Ident<'heap>> {
        if !self.is_ident() {
            return None;
        }

        let segment = self.segments.pop().unwrap_or_else(|| unreachable!());
        Some(segment.name)
    }

    /// Tries to turn this path into a generic identifier.
    ///
    /// # Errors
    ///
    /// Returns the unmodified path.
    pub fn into_generic_ident(
        mut self,
    ) -> Result<(Ident<'heap>, heap::Vec<'heap, PathSegmentArgument<'heap>>), Self> {
        if !self.is_generic_ident() {
            return Err(self);
        }

        let segment = self.segments.pop().unwrap_or_else(|| unreachable!());
        Ok((segment.name, segment.arguments))
    }

    /// Checks if this path is an absolute path that matches the provided sequence of identifiers.
    ///
    /// A path matches when:
    /// - The path is absolute (rooted with `::`)
    /// - It has the same number of segments as provided identifiers
    /// - Each segment name matches the corresponding identifier
    /// - None of the path segments have generic arguments
    pub(crate) fn matches_absolute_path<T>(
        &self,
        path: impl IntoIterator<Item = T, IntoIter: ExactSizeIterator>,
    ) -> bool
    where
        T: AsRef<str>,
    {
        if !self.rooted {
            return false;
        }

        let path = path.into_iter();

        if self.segments.len() != path.len() {
            return false;
        }

        self.segments.iter().zip(path).all(|(segment, ident)| {
            segment.name.value.as_str() == ident.as_ref() && segment.arguments.is_empty()
        })
    }

    pub(crate) fn starts_with_absolute_path<T>(
        &self,
        path: impl IntoIterator<Item = T, IntoIter: ExactSizeIterator>,
        arguments_must_be_empty: bool,
    ) -> bool
    where
        T: AsRef<str>,
    {
        if !self.rooted {
            return false;
        }

        let path = path.into_iter();

        if self.segments.len() < path.len() {
            return false;
        }

        self.segments.iter().zip(path).all(|(segment, ident)| {
            segment.name.value.as_str() == ident.as_ref()
                && (!arguments_must_be_empty || segment.arguments.is_empty())
        })
    }
}
