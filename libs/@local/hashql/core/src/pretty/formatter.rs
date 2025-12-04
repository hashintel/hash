//! Core pretty printing abstraction.
//!
//! Provides a high-level API over the `pretty` crate with semantic annotations.
//! All document construction goes through this interface.

use alloc::borrow::Cow;
use core::{iter, marker::PhantomData};

use pretty::{Arena, DocAllocator as _, DocBuilder};

use super::semantic::Semantic;
use crate::{heap::Heap, symbol::Symbol};

/// Document type produced by the formatter.
pub type Doc<'alloc> = DocBuilder<'alloc, pretty::Arena<'alloc, Semantic>, Semantic>;

/// Configuration options for document formatting.
///
/// Controls layout behavior like indentation width.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FormatterOptions {
    /// Number of spaces (or columns) to indent nested content.
    ///
    /// Default is 4. Can be negative to outdent, though this is unusual.
    pub indent: isize,
}

impl FormatterOptions {
    /// Changes the indentation width.
    #[must_use]
    pub const fn with_indent(mut self, indent: isize) -> Self {
        self.indent = indent;
        self
    }
}

impl Default for FormatterOptions {
    fn default() -> Self {
        Self { indent: 4 }
    }
}

/// Pretty printer with owned arena.
///
/// This is the primary interface for building formatted documents.
/// It owns the arena and provides all necessary primitives for document construction.
pub struct Formatter<'alloc, 'heap> {
    arena: Arena<'alloc, Semantic>,
    pub options: FormatterOptions,

    /// Phantom reference to the heap for lifetime constraints.
    ///
    /// This field exists to establish the relationship `'heap: 'alloc` without
    /// requiring Higher-Rank Trait Bounds (HRTBs) that the compiler cannot yet
    /// prove in all contexts.
    ///
    /// # Why This is Necessary
    ///
    /// The `pretty` crate requires that document-building closures receive
    /// `&'alloc Formatter<'alloc, 'heap>`, making `'alloc` invariant. To use
    /// heap-allocated symbols in formatted output, we must prove `'heap: 'alloc`.
    ///
    /// A direct bound like `struct Formatter<'alloc, 'heap: 'alloc>` would
    /// require HRTBs when used as a trait bound, which hits current compiler
    /// limitations and forces `'alloc` to become `'static`.
    ///
    /// By including `PhantomData<&'heap Heap>`, we attach the heap's lifetime
    /// to the struct itself. Since formatters are always used via `&'alloc self`,
    /// the compiler can prove `'heap: 'alloc` without additional bounds.
    _heap: PhantomData<&'heap Heap>,
}

impl<'alloc, 'heap> Formatter<'alloc, 'heap> {
    /// Creates a new pretty printer with default options.
    ///
    /// Uses 4-space indentation. For custom options, use [`Self::with_options`].
    #[must_use]
    #[expect(unused_variables, reason = "lifetime constraints")]
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            arena: Arena::new(),
            options: FormatterOptions::default(),
            _heap: PhantomData,
        }
    }

    /// Creates a pretty printer with custom formatting options.
    ///
    /// # Examples
    ///
    /// ```rust
    /// # use hashql_core::{heap::Heap, pretty::{Formatter, FormatterOptions}};
    /// let heap = Heap::default();
    /// let options = FormatterOptions::default().with_indent(2);
    /// let formatter = Formatter::with_options(&heap, options);
    /// ```
    #[must_use]
    #[expect(unused_variables, reason = "lifetime constraints")]
    pub fn with_options(heap: &'heap Heap, options: FormatterOptions) -> Self {
        Self {
            arena: Arena::new(),
            options,
            _heap: PhantomData,
        }
    }

    /// Sets the indentation width for this formatter.
    ///
    /// This is a convenience method that modifies the formatter's options.
    #[must_use]
    pub const fn with_indent(mut self, indent: isize) -> Self {
        self.options.indent = indent;
        self
    }

    /// Returns a reference to the underlying arena.
    ///
    /// This is only needed for passing to rendering functions.
    pub const fn arena(&'alloc self) -> &'alloc Arena<'alloc, Semantic> {
        &self.arena
    }

    // === Semantic constructors ===
    //
    // These methods create semantically annotated text elements. Each element
    // is categorized for appropriate styling during rendering (colors, etc.).

    /// Creates a keyword element.
    ///
    /// For language keywords like `let`, `in`, `if`, `fn`, etc.
    #[must_use]
    pub fn keyword(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Keyword)
    }

    /// Creates a type name element.
    ///
    /// For type names like `Integer`, `String`, `List`, user-defined types, etc.
    #[must_use]
    pub fn type_name(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::TypeName)
    }

    /// Creates a type name element from a string.
    #[must_use]
    pub fn type_name_str(&'alloc self, text: impl Into<Cow<'alloc, str>>) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::TypeName)
    }

    /// Creates a variable or function name element.
    ///
    /// For identifiers in expressions like variable references and function names.
    #[must_use]
    pub fn variable(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Variable)
    }

    /// Creates a variable element from an owned string.
    #[must_use]
    pub fn variable_owned(&'alloc self, text: String) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Variable)
    }

    /// Creates an operator element from a string slice.
    ///
    /// For operators like `+`, `->`, `=>`, `|`, `&`, etc.
    #[must_use]
    fn op_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Operator)
    }

    /// Creates an operator element.
    ///
    /// For operators like `+`, `->`, `=>`, `|`, `&`, etc.
    #[must_use]
    pub fn op(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.op_str(text.unwrap())
    }

    /// Creates a punctuation element from a string slice.
    ///
    /// For structural punctuation like `(`, `)`, `[`, `]`, `,`, `:`, etc.
    #[must_use]
    fn punct_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Punctuation)
    }

    /// Creates a punctuation element.
    ///
    /// For structural punctuation like `(`, `)`, `[`, `]`, `,`, `:`, etc.
    #[must_use]
    pub fn punct(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.punct_str(text.unwrap())
    }

    /// Creates a literal value element.
    ///
    /// For literal values like numbers, strings, booleans, null, etc.
    #[must_use]
    pub fn literal(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Literal)
    }

    /// Creates a literal element from a string.
    ///
    /// For literal values like numbers, strings, booleans, null, etc.
    #[must_use]
    pub fn literal_str(&'alloc self, text: impl Into<Cow<'alloc, str>>) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Literal)
    }

    /// Creates a field name element.
    ///
    /// For struct field names, object keys, etc.
    #[must_use]
    pub fn field(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Field)
    }

    /// Creates a comment or metadata element.
    ///
    /// For comments, recursion indicators like `...`, etc.
    #[must_use]
    pub fn comment(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Comment)
    }

    /// Creates a comment or metadata element from a string slice.
    ///
    /// For comments, recursion indicators like `...`, etc.
    #[must_use]
    pub fn comment_str(&'alloc self, text: impl Into<Cow<'alloc, str>>) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Comment)
    }

    /// Creates plain text from a string slice without semantic annotation.
    #[must_use]
    pub fn text_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text)
    }

    /// Creates plain text without semantic annotation.
    #[must_use]
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

    /// Wraps content in angle brackets.
    pub fn enclosed(
        &'alloc self,
        left: &'static str,
        content: Doc<'alloc>,
        right: &'static str,
    ) -> Doc<'alloc> {
        self.punct_str(left)
            .append(content)
            .append(self.punct_str(right))
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
            self.line().append(self.punct_str("|")).append(self.space()),
        )
    }

    pub fn intersection<I>(&'alloc self, items: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.intersperse(
            items,
            self.line().append(self.punct_str("&")).append(self.space()),
        )
    }

    /// Formats delimited content with rustfmt-style breaking.
    ///
    /// - Compact: `(a, b, c)` - items separated by `, `.
    /// - Expanded: `(\n    a,\n    b,\n    c\n)` - each item on own line with configured indent.
    pub fn delimited<I>(
        &'alloc self,
        open: &'alloc str,
        items: I,
        close: &'alloc str,
    ) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        let mut items = items.into_iter();
        let Some(first) = items.next() else {
            return self.punct_str(open).append(self.punct_str(close));
        };

        let items = iter::once(first).chain(items);

        // When group() flattens: line_() → nothing, line() → space
        // So we get: (a, b, c) when flat
        // And: (\n    a,\n    b,\n    c\n) when broken
        self.punct_str(open)
            .append(
                self.line_()
                    .append(self.intersperse(items, self.punct_str(",").append(self.line())))
                    .nest(self.options.indent)
                    .append(self.line_()),
            )
            .append(self.punct_str(close))
            .group()
    }

    // === High-level patterns ===

    /// Formats a tuple with proper handling of empty and single-element cases.
    ///
    /// - Empty: `()`.
    /// - Single: `(T, )`.
    /// - Multiple: `(A, B, C)`.
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
            return self.delimited("(", [first.append(self.punct_str(","))], ")");
        };

        self.delimited("(", [first, second].into_iter().chain(items), ")")
    }

    /// Formats key-value pairs with spaces around separator.
    ///
    /// Example: `key = value` or `T = Integer`.
    pub fn key_value(
        &'alloc self,
        key: Doc<'alloc>,
        sep: &'static str,
        value: Doc<'alloc>,
    ) -> Doc<'alloc> {
        key.append(self.space())
            .append(self.punct_str(sep))
            .append(self.space())
            .append(value)
    }

    /// Formats field-type pairs without space before separator.
    ///
    /// Example: `foo: Type` or `bar: Integer`.
    pub fn field_type(&'alloc self, name: Doc<'alloc>, ty: Doc<'alloc>) -> Doc<'alloc> {
        name.append(self.punct_str(":"))
            .append(self.space())
            .append(ty)
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
            .map(|(name, ty)| self.field_type(name, ty));

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
    /// Example: `<T, U, V>` or when broken: `<\n    T,\n    U,\n    V\n>`.
    pub fn generic_args<I>(&'alloc self, args: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.delimited("<", args, ">")
    }

    /// Formats a generic application (substitutions applied to a base type).
    ///
    /// Uses square brackets to distinguish from generic args.
    /// Example: `[T = Integer] (foo: T)` - space after to separate from base.
    pub fn generic_apply<I>(&'alloc self, substitutions: I, base: Doc<'alloc>) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.delimited("[", substitutions, "]")
            .append(self.space())
            .append(base)
    }

    pub fn closure_type<I>(&'alloc self, params: I, returns: Doc<'alloc>) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        let params_doc = self.delimited("(", params, ")");

        params_doc
            .append(self.space())
            .append(self.op_str("->"))
            .append(
                self.line()
                    .append(returns)
                    .nest(self.options.indent)
                    .group(),
            )
    }

    /// Formats a function type signature.
    ///
    /// Example: `(a: A, b: B) -> C`.
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
