//! Core pretty printing abstraction.
//!
//! Provides a high-level API over the `pretty` crate with semantic annotations.
//! All document construction goes through this interface.

use core::iter;

use pretty::{Arena, DocAllocator as _, DocBuilder};

use super::semantic::Semantic;
use crate::symbol::Symbol;

type PrettyDoc<'pretty> = DocBuilder<'pretty, pretty::Arena<'pretty, Semantic>, Semantic>;

/// Pretty printer with owned arena.
///
/// This is the primary interface for building formatted documents.
/// It owns the arena and provides all necessary primitives for document construction.
pub struct Pretty<'heap> {
    arena: Arena<'heap, Semantic>,
}

impl<'heap> Pretty<'heap> {
    /// Creates a new pretty printer.
    #[must_use]
    pub fn new() -> Self {
        Self {
            arena: Arena::new(),
        }
    }

    /// Returns a reference to the underlying arena.
    ///
    /// This is only needed for passing to rendering functions.
    pub const fn arena(&self) -> &Arena<'heap, Semantic> {
        &self.arena
    }

    // === Semantic constructors ===

    /// Creates a keyword (let, in, if, fn, etc.).
    pub fn keyword<'this: 'heap>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this> {
        self.arena.text(text.unwrap()).annotate(Semantic::Keyword)
    }

    /// Creates a type name (Integer, String, List, etc.).
    pub fn type_name<'this: 'heap>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this> {
        self.arena.text(text.unwrap()).annotate(Semantic::TypeName)
    }

    /// Creates a variable or function name.
    pub fn variable<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text.unwrap()).annotate(Semantic::Variable)
    }

    /// Creates an operator (+, ->, =>, |, &, etc.).
    pub fn op_str<'this>(&'this self, text: &'this str) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text).annotate(Semantic::Operator)
    }

    /// Creates an operator (+, ->, =>, |, &, etc.).
    pub fn op<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.op_str(text.unwrap())
    }

    fn punct_str<'this: 'heap>(&'this self, text: &'this str) -> PrettyDoc<'this> {
        self.arena.text(text).annotate(Semantic::Punctuation)
    }

    /// Creates punctuation (parentheses, brackets, commas, colons, etc.).
    pub fn punct<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.punct_str(text.unwrap())
    }

    /// Creates a literal value (number, string, boolean).
    pub fn literal<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text.unwrap()).annotate(Semantic::Literal)
    }

    /// Creates a field name.
    pub fn field<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text.unwrap()).annotate(Semantic::Field)
    }

    /// Creates a comment or metadata annotation.
    pub fn comment<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text.unwrap()).annotate(Semantic::Comment)
    }

    /// Creates plain text without semantic annotation.
    pub fn text<'this>(&'this self, text: Symbol<'heap>) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.text(text.unwrap())
    }

    // === Basic document combinators ===

    /// Creates an empty document.
    pub fn nil<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.nil()
    }

    /// Creates a space.
    pub fn space<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.space()
    }

    /// Creates a hard line break (always breaks).
    pub fn hardline<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.hardline()
    }

    /// Creates a line break that becomes a space when grouped.
    pub fn line<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.line()
    }

    /// Creates a line break that disappears when grouped.
    pub fn line_<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.line_()
    }

    /// Creates a soft line break (line that becomes space when grouped).
    pub fn softline<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.softline()
    }

    /// Creates a soft line break that disappears when grouped.
    pub fn softline_<'this>(&'this self) -> PrettyDoc<'this>
    where
        'this: 'heap,
    {
        self.arena.softline_()
    }

    /// Concatenates documents.
    pub fn concat<'this, I>(&'this self, docs: I) -> PrettyDoc<'this>
    where
        'this: 'heap,
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        self.arena.concat(docs)
    }

    /// Intersperses documents with a separator.
    pub fn intersperse<'this, I>(
        &'this self,
        docs: I,
        separator: PrettyDoc<'this>,
    ) -> PrettyDoc<'this>
    where
        'this: 'heap,
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        self.arena.intersperse(docs, separator)
    }

    // === Convenience helpers ===

    /// Wraps content in parentheses.
    pub fn parens<'this: 'heap>(&'this self, content: PrettyDoc<'this>) -> PrettyDoc<'this> {
        self.punct_str("(")
            .append(content)
            .append(self.punct_str(")"))
    }

    /// Wraps content in square brackets.
    pub fn brackets<'this: 'heap>(&'this self, content: PrettyDoc<'this>) -> PrettyDoc<'this> {
        self.punct_str("[")
            .append(content)
            .append(self.punct_str("]"))
    }

    /// Wraps content in curly braces.
    pub fn braces<'this: 'heap>(&'this self, content: PrettyDoc<'this>) -> PrettyDoc<'this> {
        self.punct_str("{")
            .append(content)
            .append(self.punct_str("}"))
    }

    /// Wraps content in angle brackets.
    pub fn angles<'this: 'heap>(&'this self, content: PrettyDoc<'this>) -> PrettyDoc<'this> {
        self.punct_str("<")
            .append(content)
            .append(self.punct_str(">"))
    }

    /// Creates comma-separated items with soft line breaks.
    pub fn comma_sep<'this: 'heap, I>(&'this self, items: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        self.intersperse(items, self.punct_str(",").append(self.softline()))
    }

    pub fn delimited<'this: 'heap, I>(
        &'this self,
        open: &'this str,
        items: I,
        close: &'this str,
    ) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        let inner = self.comma_sep(items).nest(1).group();

        self.punct_str(open)
            .append(inner)
            .append(self.punct_str(close))
            .group()
    }

    // === High-level patterns ===

    /// Formats a tuple with proper handling of empty and single-element cases.
    ///
    /// - Empty: `()`
    /// - Single: `(T, )`
    /// - Multiple: `(A, B, C)`
    pub fn tuple<'this: 'heap, I>(&'this self, items: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        let mut items = items.into_iter();

        let Some(first) = items.next() else {
            return self.punct_str("()");
        };

        // Check if we have a *second* item
        let Some(second) = items.next() else {
            return self.delimited("(", [first, self.punct_str(",")], ")");
        };

        self.delimited("(", [first, second].into_iter().chain(items), ")")
    }

    /// Formats a struct with named fields.
    ///
    /// - Empty: `(:)`
    /// - Fields: `(name: Type, ...)`
    pub fn r#struct<'this: 'heap, I>(&'this self, fields: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = (PrettyDoc<'this>, PrettyDoc<'this>)>,
    {
        let mut fields = fields.into_iter();

        let Some(first) = fields.next() else {
            return self.punct_str("(:)");
        };

        let field_docs = iter::once(first).chain(fields).map(|(name, value)| {
            name.append(self.punct_str(":"))
                .append(self.space())
                .append(value)
        });

        self.delimited("(", field_docs, ")")
    }

    /// Formats a list.
    pub fn list<'this: 'heap, I>(&'this self, items: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        self.delimited("[", items, "]")
    }

    /// Formats a dictionary/map with key-value pairs.
    pub fn dict<'this: 'heap, I>(&'this self, pairs: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = (PrettyDoc<'this>, PrettyDoc<'this>)>,
    {
        let field_docs = pairs.into_iter().map(|(key, value)| {
            key.append(self.punct_str(":"))
                .append(self.space())
                .append(value)
        });

        self.delimited("{", field_docs, "}")
    }

    /// Formats generic type arguments.
    ///
    /// Example: `<T, U, V>`
    pub fn generic_args<'this: 'heap, I>(&'this self, args: I) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = PrettyDoc<'this>>,
    {
        let inner = self.comma_sep(args).nest(1).group();

        self.angles(inner).group()
    }

    /// Formats a function type signature.
    ///
    /// Example: `(a: A, b: B) -> C`
    pub fn function_type<'this: 'heap, I>(
        &'this self,
        params: I,
        returns: PrettyDoc<'this>,
    ) -> PrettyDoc<'this>
    where
        I: IntoIterator<Item = (PrettyDoc<'this>, PrettyDoc<'this>)>,
    {
        let param_docs = params.into_iter().map(|(name, ty)| {
            name.append(self.punct_str(":"))
                .append(self.space())
                .append(ty)
        });

        let params_doc = self.comma_sep(param_docs).nest(1).group();

        self.parens(params_doc)
            .append(self.space())
            .append(self.op_str("->"))
            .append(self.space())
            .append(returns)
            .group()
    }
}

impl Default for Pretty<'_> {
    fn default() -> Self {
        Self::new()
    }
}
