//! Core pretty printing abstraction.
//!
//! Provides a high-level API over the `pretty` crate with semantic annotations.
//! All document construction goes through this interface.

use core::iter;

use pretty::{Arena, DocAllocator as _, DocBuilder};

use super::semantic::Semantic;
use crate::{heap::Heap, symbol::Symbol};

pub type Doc<'alloc> = DocBuilder<'alloc, pretty::Arena<'alloc, Semantic>, Semantic>;

/// Pretty printer with owned arena.
///
/// This is the primary interface for building formatted documents.
/// It owns the arena and provides all necessary primitives for document construction.
pub struct Formatter<'alloc, 'heap> {
    arena: Arena<'alloc, Semantic>,
    heap: &'heap Heap,
}

impl<'alloc, 'heap> Formatter<'alloc, 'heap> {
    /// Creates a new pretty printer.
    #[must_use]
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            arena: Arena::new(),
            heap,
        }
    }

    /// Returns a reference to the underlying arena.
    ///
    /// This is only needed for passing to rendering functions.
    pub const fn arena(&'alloc self) -> &'alloc Arena<'alloc, Semantic> {
        &self.arena
    }

    // === Semantic constructors ===

    /// Creates a keyword (let, in, if, fn, etc.).
    pub fn keyword(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Keyword)
    }

    /// Creates a type name (Integer, String, List, etc.).
    pub fn type_name(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::TypeName)
    }

    pub fn type_name_owned(&'alloc self, text: String) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::TypeName)
    }

    /// Creates a variable or function name.
    pub fn variable(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Variable)
    }

    /// Creates an operator (+, ->, =>, |, &, etc.).
    pub fn op_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Operator)
    }

    /// Creates an operator (+, ->, =>, |, &, etc.).
    pub fn op(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.op_str(text.unwrap())
    }

    fn punct_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Punctuation)
    }

    /// Creates punctuation (parentheses, brackets, commas, colons, etc.).
    pub fn punct(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.punct_str(text.unwrap())
    }

    /// Creates a literal value (number, string, boolean).
    pub fn literal(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Literal)
    }

    /// Creates a field name.
    pub fn field(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Field)
    }

    /// Creates a comment or metadata annotation.
    pub fn comment(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Comment)
    }

    pub fn text_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text)
    }

    /// Creates plain text without semantic annotation.
    pub fn text(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap())
    }

    // === Basic document combinators ===

    /// Creates an empty document.
    pub fn nil(&'alloc self) -> Doc<'alloc> {
        self.arena.nil()
    }

    /// Creates a space.
    pub fn space(&'alloc self) -> Doc<'alloc> {
        self.arena.space()
    }

    /// Creates a hard line break (always breaks).
    pub fn hardline(&'alloc self) -> Doc<'alloc> {
        self.arena.hardline()
    }

    /// Creates a line break that becomes a space when grouped.
    pub fn line(&'alloc self) -> Doc<'alloc> {
        self.arena.line()
    }

    /// Creates a line break that disappears when grouped.
    pub fn line_(&'alloc self) -> Doc<'alloc> {
        self.arena.line_()
    }

    /// Creates a soft line break (line that becomes space when grouped).
    pub fn softline(&'alloc self) -> Doc<'alloc> {
        self.arena.softline()
    }

    /// Creates a soft line break that disappears when grouped.
    pub fn softline_(&'alloc self) -> Doc<'alloc> {
        self.arena.softline_()
    }

    /// Concatenates documents.
    pub fn concat<I>(&'alloc self, docs: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.arena.concat(docs)
    }

    /// Intersperses documents with a separator.
    pub fn intersperse<I>(&'alloc self, docs: I, separator: Doc<'alloc>) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.arena.intersperse(docs, separator)
    }

    // === Convenience helpers ===

    /// Wraps content in parentheses.
    pub fn parens(&'alloc self, content: Doc<'alloc>) -> Doc<'alloc> {
        self.punct_str("(")
            .append(content)
            .append(self.punct_str(")"))
    }

    /// Wraps content in square brackets.
    pub fn brackets(&'alloc self, content: Doc<'alloc>) -> Doc<'alloc> {
        self.punct_str("[")
            .append(content)
            .append(self.punct_str("]"))
    }

    /// Wraps content in curly braces.
    pub fn braces(&'alloc self, content: Doc<'alloc>) -> Doc<'alloc> {
        self.punct_str("{")
            .append(content)
            .append(self.punct_str("}"))
    }

    /// Wraps content in angle brackets.
    pub fn angles(&'alloc self, content: Doc<'alloc>) -> Doc<'alloc> {
        self.punct_str("<")
            .append(content)
            .append(self.punct_str(">"))
    }

    /// Creates comma-separated items with soft line breaks.
    pub fn comma_sep<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.intersperse(items, self.punct_str(",").append(self.softline()))
    }

    pub fn union<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.intersperse(
            items,
            self.softline_()
                .append(self.punct_str("|"))
                .append(self.space()),
        )
    }

    pub fn intersection<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.intersperse(
            items,
            self.softline_()
                .append(self.punct_str("&"))
                .append(self.space()),
        )
    }

    pub fn delimited<I>(
        &'alloc self,
        open: &'alloc str,
        items: I,
        close: &'alloc str,
    ) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
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
    pub fn tuple<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
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

    pub fn key_value(
        &'alloc self,
        key: Doc<'alloc>,
        sep: &'static str,
        value: Doc<'alloc>,
    ) -> Doc<'alloc> {
        key.append(self.punct_str(sep))
            .append(self.space())
            .append(value)
    }

    /// Formats a struct with named fields.
    ///
    /// - Empty: `(:)`
    /// - Fields: `(name: Type, ...)`
    pub fn r#struct<I>(&'alloc self, fields: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = (Doc<'alloc>, Doc<'alloc>)>,
    {
        let mut fields = fields.into_iter();

        let Some(first) = fields.next() else {
            return self.punct_str("(:)");
        };

        let field_docs = iter::once(first)
            .chain(fields)
            .map(|(name, value)| self.key_value(name, ":", value));

        self.delimited("(", field_docs, ")")
    }

    /// Formats a list.
    pub fn list<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.delimited("[", items, "]")
    }

    /// Formats a dictionary/map with key-value pairs.
    pub fn dict<I>(&'alloc self, pairs: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = (Doc<'alloc>, Doc<'alloc>)>,
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
    pub fn generic_args<I>(&'alloc self, args: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        let inner = self.comma_sep(args).nest(1).group();

        self.angles(inner).group()
    }

    pub fn closure_type<I>(&'alloc self, params: I, returns: Doc<'alloc>) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        let params_doc = self.comma_sep(params).nest(1).group();

        self.parens(params_doc)
            .append(self.space())
            .append(self.op_str("->"))
            .append(self.space())
            .append(returns)
            .group()
    }

    /// Formats a function type signature.
    ///
    /// Example: `(a: A, b: B) -> C`
    pub fn closure_signature<I>(&'alloc self, params: I, returns: Doc<'alloc>) -> Doc<'alloc>
    where
        I: IntoIterator<Item = (Doc<'alloc>, Doc<'alloc>)>,
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
