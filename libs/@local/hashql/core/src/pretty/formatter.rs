//! Core pretty printing abstraction.
//!
//! Provides a high-level API over the `pretty` crate with semantic annotations.
//! All document construction goes through this interface.

use core::{iter, marker::PhantomData};

use pretty::{Arena, DocAllocator as _, DocBuilder};

use super::semantic::Semantic;
use crate::{heap::Heap, symbol::Symbol};

pub type Doc<'alloc> = DocBuilder<'alloc, pretty::Arena<'alloc, Semantic>, Semantic>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FormatterOptions {
    pub indent: isize,
}

/// Pretty printer with owned arena.
///
/// This is the primary interface for building formatted documents.
/// It owns the arena and provides all necessary primitives for document construction.
pub struct Formatter<'alloc, 'heap> {
    arena: Arena<'alloc, Semantic>,
    pub options: FormatterOptions,

    // You may ask yourself: wow this is weird, why do we have a (phantom) reference to the heap
    // here? The answer is lifetime constraints. To be able to use any data inside of the heap
    // we must prove that `heap` outlives the formatter. We cannot do this normally through `'fmt:
    // 'heap`, because then we would need to use HRTB, HRTB's cannot express lifetime bounds, even
    // if put on the top level of the encompassing trait aka `struct Formatter<'fmt, 'heap: 'fmt>`
    // we run into a compiler limitation. The compiler is unable to prove this HRTB (yet) and so
    // `'fmt` turns static.
    // but(!) because we always need to take a reference to the underlying reference (so this very
    // type), if we attach the lifetime of the heap here, we can *always* prove that the heap
    // outlives the formatter. Without *any* additional trait bounds making it "just work".
    // (We need to always take a reference to the formatter - this type - because of a limitation
    // of the pretty crate). The type that provisions the doc must have the same lifetime as the
    // arena itself, leading to `&'fmt Formatter<'fmt, 'heap>` as the trait bound – making `'fmt`
    // invariant. It's a bit silly, but you play with the cards that you're dealt.
    _heap: PhantomData<&'heap Heap>,
}

impl<'alloc, 'heap> Formatter<'alloc, 'heap> {
    /// Creates a new pretty printer.
    #[must_use]
    #[expect(unused_variables, reason = "lifetime constraints")]
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            arena: Arena::new(),
            options: FormatterOptions { indent: 4 },
            _heap: PhantomData,
        }
    }

    #[must_use]
    #[expect(unused_variables, reason = "lifetime constraints")]
    pub fn with_options(heap: &'heap Heap, options: FormatterOptions) -> Self {
        Self {
            arena: Arena::new(),
            options,
            _heap: PhantomData,
        }
    }

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

    /// Creates a keyword (let, in, if, fn, etc.).
    pub fn keyword(&'alloc self, text: Symbol<'heap>) -> Doc<'alloc> {
        self.arena.text(text.unwrap()).annotate(Semantic::Keyword)
    }

    pub fn keyword_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Keyword)
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

    pub fn punct_str(&'alloc self, text: &'alloc str) -> Doc<'alloc> {
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

    /// Creates a literal value (number, string, boolean).
    pub fn literal_owned(&'alloc self, text: String) -> Doc<'alloc> {
        self.arena.text(text).annotate(Semantic::Literal)
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

    /// Formats delimited content with rustfmt-style breaking.
    ///
    /// Compact: `(a, b, c)` - items separated by `, `
    /// Expanded: `(\n    a,\n    b,\n    c\n)` - each item on own line with configured indent
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

    /// Formats key-value pairs with spaces around separator.
    ///
    /// Example: `key = value` or `T = Integer`
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
    /// Example: `foo: Type` or `bar: Integer`
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
    /// Example: `<T, U, V>` or when broken: `<\n    T,\n    U,\n    V\n>`
    pub fn generic_args<I>(&'alloc self, args: I) -> Doc<'alloc>
    where
        I: IntoIterator<Item = Doc<'alloc>>,
    {
        self.delimited("<", args, ">")
    }

    /// Formats a generic application (substitutions applied to a base type).
    ///
    /// Uses square brackets to distinguish from generic args.
    /// Example: `[T = Integer] (foo: T)` - space after to separate from base
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
