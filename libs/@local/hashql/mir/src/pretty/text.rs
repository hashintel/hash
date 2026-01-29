// Textual representation of bodies, based on a similar syntax used by rustc

use core::fmt::Display;
use std::io::{self, Write as _};

use hashql_core::{
    id::Id as _,
    intern::Interned,
    pretty::{RenderFormat, RenderOptions},
    symbol::Symbol,
    r#type::{TypeFormatter, TypeId},
};
use hashql_hir::node::{r#let::Binder, operation::InputOp};

use super::{FormatPart, SourceLookup};
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::{Local, LocalDecl},
        location::Location,
        operand::Operand,
        place::{Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, Return, SwitchInt,
            Target, Terminator, TerminatorKind,
        },
    },
    def::{DefId, DefIdSlice},
};

const fn source_keyword(source: Source<'_>) -> &'static str {
    match source {
        Source::Thunk(..) => "thunk",
        Source::Ctor(_)
        | Source::Closure(..)
        | Source::GraphReadFilter(..)
        | Source::Intrinsic(_) => "fn",
    }
}

/// Configuration options for formatting function signatures.
pub(crate) struct SignatureOptions {
    /// The output format (plain text or HTML fragment).
    pub format: RenderFormat,
}

/// A wrapper for formatting function signatures from MIR bodies.
///
/// Renders the function keyword, name, parameter list with types, and return type.
pub(crate) struct Signature<'body, 'heap>(pub &'body Body<'heap>, pub SignatureOptions);

/// A helper struct for formatting key-value pairs with consistent syntax.
struct KeyValuePair<K, V>(K, V);

/// A set of definition IDs to visually highlight in formatted output.
///
/// When formatting multiple MIR bodies, those with IDs in this set will be
/// marked distinctly (e.g., prefixed with `*` in text output or colored in D2).
pub(crate) struct HighlightBody<'def>(pub &'def [DefId]);

/// A trait for providing inline annotations during text formatting.
///
/// Implementations can attach comments or annotations to statements and local
/// declarations in the formatted output. Annotations appear as trailing comments
/// (e.g., `// annotation`) after the formatted line.
pub trait TextFormatAnnotations {
    /// The type of annotation displayed after statements.
    type StatementAnnotation<'this, 'heap>: Display
        = !
    where
        Self: 'this;

    /// The type of annotation displayed after local declarations.
    type DeclarationAnnotation<'this, 'heap>: Display
        = !
    where
        Self: 'this;

    /// Returns an optional annotation for the given statement at `location`.
    #[expect(unused_variables, reason = "trait definition")]
    fn annotate_statement<'heap>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Option<Self::StatementAnnotation<'_, 'heap>> {
        None
    }

    /// Returns an optional annotation for the given local declaration.
    #[expect(unused_variables, reason = "trait definition")]
    fn annotate_local_decl<'heap>(
        &self,
        local: Local,
        declaration: &LocalDecl<'heap>,
    ) -> Option<Self::DeclarationAnnotation<'_, 'heap>> {
        None
    }
}

impl TextFormatAnnotations for () {}

/// Configuration for constructing a [`TextFormat`] formatter.
pub struct TextFormatOptions<W, S, T, A> {
    /// The writer where formatted text will be written.
    pub writer: W,
    /// Number of spaces per indentation level.
    pub indent: usize,
    /// Source lookup for resolving symbols and identifiers.
    pub sources: S,
    /// Type formatter for rendering type information.
    pub types: T,
    /// Annotation provider for adding inline comments.
    pub annotations: A,
}

impl<W, S, T, A> TextFormatOptions<W, S, T, A> {
    pub fn build(self) -> TextFormat<W, S, T, A> {
        TextFormat::new(self)
    }
}

/// A text-based formatter for MIR (Middle Intermediate Representation) structures.
///
/// This formatter converts MIR components into human-readable text representation,
/// suitable for debugging, documentation, or textual display of program structure.
/// It handles proper indentation, symbol resolution, and formatting of complex
/// MIR constructs like basic blocks, statements, and terminators.
///
/// # Type Parameters
///
/// - `W`: A writer implementing [`io::Write`] for text output
/// - `S`: A source lookup implementing [`SourceLookup`] for symbol resolution
/// - `T`: A type which implements [`AsMut<TypeFormatter>`] for type information
pub struct TextFormat<W, S, T, A> {
    /// The writer where formatted text will be written.
    pub writer: W,
    /// Amount of indention per level.
    indent: usize,
    /// Source lookup for resolving symbols and identifiers.
    sources: S,
    /// Type formatter for formatting type information.
    types: T,
    annotations: A,

    line_buffer: Vec<u8>,
}

impl<W, S, T, A> TextFormat<W, S, T, A> {
    pub fn new(
        TextFormatOptions {
            writer,
            indent,
            sources,
            types,
            annotations,
        }: TextFormatOptions<W, S, T, A>,
    ) -> Self {
        Self {
            writer,
            indent,
            sources,
            types,
            annotations,
            line_buffer: Vec::new(),
        }
    }
}

impl<W, S, T, A> TextFormat<W, S, T, A>
where
    W: io::Write,
{
    /// Formats a collection of MIR bodies as human-readable text.
    ///
    /// This is the main entry point for the text formatter. It processes all the provided
    /// MIR bodies and generates formatted text representation of their structure, including
    /// function signatures, basic blocks, statements, and control flow.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] if writing to the underlying writer fails.
    pub fn format<'fmt, 'env, 'heap: 'fmt + 'env>(
        &mut self,
        bodies: &DefIdSlice<Body<'heap>>,
        highlight: &[DefId],
    ) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
        T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
        A: TextFormatAnnotations,
    {
        self.format_part((bodies, HighlightBody(highlight)))?;
        self.flush()
    }

    /// Formats a single MIR body as human-readable text.
    ///
    /// Unlike [`format`], which processes multiple bodies and supports highlighting,
    /// this method formats a single `body` without any highlighting applied.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] if writing to the underlying writer fails.
    ///
    /// [`format`]: Self::format
    pub fn format_body<'fmt, 'env, 'heap: 'fmt + 'env>(
        &mut self,
        body: &Body<'heap>,
    ) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
        T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
        A: TextFormatAnnotations,
    {
        self.format_part((body, BodyRenderOptions { highlight: false }))?;
        self.flush()
    }

    fn separated_list<V>(
        &mut self,
        sep: &[u8],
        values: impl IntoIterator<Item = V>,
    ) -> io::Result<()>
    where
        Self: FormatPart<V>,
    {
        let mut values = values.into_iter();
        let Some(first) = values.next() else {
            return Ok(());
        };

        self.format_part(first)?;

        for value in values {
            self.line_buffer.write_all(sep)?;
            self.format_part(value)?;
        }

        Ok(())
    }

    fn csv<V>(&mut self, values: impl IntoIterator<Item = V>) -> io::Result<()>
    where
        Self: FormatPart<V>,
    {
        self.separated_list(b", ", values)
    }

    fn indent(&mut self, level: usize) -> io::Result<()> {
        write!(
            self.line_buffer,
            "{:width$}",
            "",
            width = level * self.indent
        )
    }

    fn newline(&mut self) -> io::Result<()> {
        self.line_buffer.push(b'\n');
        self.writer.write_all(&self.line_buffer)?;

        self.line_buffer.clear();
        Ok(())
    }

    pub(crate) fn flush(&mut self) -> io::Result<()> {
        self.writer.write_all(&self.line_buffer)?;
        self.line_buffer.clear();
        Ok(())
    }
}

impl<'heap, W, S, T, A> FormatPart<DefId> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: DefId) -> io::Result<()> {
        let source = self.sources.source(value);
        if let Some(source) = source {
            self.format_part(source)
        } else {
            write!(self.line_buffer, "{{def@{value}}}")
        }
    }
}

impl<W, S, T, A> FormatPart<&str> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: &str) -> io::Result<()> {
        write!(self.line_buffer, "{value}")
    }
}

impl<'heap, W, S, T, A> FormatPart<Symbol<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Symbol<'heap>) -> io::Result<()> {
        write!(self.line_buffer, "{value}")
    }
}

impl<W, S, T, A> FormatPart<Local> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Local) -> io::Result<()> {
        write!(self.line_buffer, "{value}")
    }
}

impl<'heap, W, S, T, A> FormatPart<Place<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, Place { local, projections }: Place<'heap>) -> io::Result<()> {
        self.format_part(local)?;

        for projection in projections {
            match projection.kind {
                ProjectionKind::Field(index) => write!(self.line_buffer, ".{index}")?,
                ProjectionKind::FieldByName(symbol) => write!(self.line_buffer, ".{symbol}")?,
                ProjectionKind::Index(local) => {
                    write!(self.line_buffer, "[")?;
                    self.format_part(local)?;
                    write!(self.line_buffer, "]")?;
                }
            }
        }

        Ok(())
    }
}

impl<'heap, W, S, T, A> FormatPart<Constant<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: Constant<'heap>) -> io::Result<()> {
        match value {
            Constant::Int(int) => write!(self.line_buffer, "{int}"),
            Constant::Primitive(primitive) => write!(self.line_buffer, "{primitive}"),
            Constant::Unit => self.line_buffer.write_all(b"()"),
            Constant::FnPtr(def) => {
                self.line_buffer.write_all(b"(")?;
                self.format_part(def)?;
                self.line_buffer.write_all(b" as FnPtr)")
            }
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<Operand<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: Operand<'heap>) -> io::Result<()> {
        match value {
            Operand::Place(place) => self.format_part(place),
            Operand::Constant(constant) => self.format_part(constant),
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<Source<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Source<'heap>) -> io::Result<()> {
        let mut named_symbol = |name, id, binder: Option<Binder<'_>>| {
            if let Some(binder) = binder {
                if let Some(name) = binder.name {
                    return self.line_buffer.write_all(name.as_bytes());
                }

                return write!(self.line_buffer, "{{{name}#{}}}", binder.id);
            }

            write!(self.line_buffer, "{{{name}@{id}}}")
        };

        match value {
            Source::Ctor(symbol) => {
                write!(self.line_buffer, "{{ctor#{symbol}}}")
            }
            Source::Closure(id, binder) => named_symbol("closure", id, binder),
            Source::GraphReadFilter(id) => named_symbol("graph::read::filter", id, None),
            Source::Thunk(id, binder) => named_symbol("thunk", id, binder),
            Source::Intrinsic(def_id) => {
                write!(self.line_buffer, "{{intrinsic#{def_id}}}")
            }
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<(BasicBlockId, &BasicBlock<'heap>)> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    A: TextFormatAnnotations,
{
    fn format_part(&mut self, (id, block): (BasicBlockId, &BasicBlock<'heap>)) -> io::Result<()> {
        self.indent(1)?;

        write!(self.line_buffer, "{id}(")?;
        self.csv(block.params.iter().copied())?;
        writeln!(self.line_buffer, "): {{")?;

        let mut location = Location {
            block: id,
            statement_index: 0,
        };

        for statement in &block.statements {
            location.statement_index += 1;

            self.format_part((location, statement))?;
            self.newline()?;
        }

        if !block.statements.is_empty() {
            self.newline()?;
        }

        self.indent(2)?;
        self.format_part(&block.terminator)?;
        self.newline()?;

        self.indent(1)?;
        writeln!(self.line_buffer, "}}")?;

        Ok(())
    }
}

/// A wrapper for formatting target parameters in MIR terminators.
///
/// Renders the argument list as `(arg1, arg2, ...)` for goto and switch targets.
pub(crate) struct TargetParams<'heap>(pub Interned<'heap, [Operand<'heap>]>);

impl<'heap, W, S, T, A> FormatPart<TargetParams<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TargetParams(args): TargetParams<'heap>) -> io::Result<()> {
        write!(self.line_buffer, "(")?;
        self.csv(args.iter().copied())?;
        write!(self.line_buffer, ")")
    }
}

impl<'heap, W, S, T, A> FormatPart<Target<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Target { block, args }: Target<'heap>) -> io::Result<()> {
        write!(self.line_buffer, "{block}")?;
        self.format_part(TargetParams(args))
    }
}

struct AnonymousTarget(BasicBlockId);

impl<'heap, W, S, T, A> FormatPart<AnonymousTarget> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, AnonymousTarget(id): AnonymousTarget) -> io::Result<()> {
        write!(self.line_buffer, "{id}(_)")
    }
}

/// Configuration options for formatting types in MIR output.
pub(crate) struct TypeOptions {
    /// The output format (plain text or HTML fragment).
    format: RenderFormat,
}

impl TypeOptions {
    fn render(self) -> RenderOptions {
        // We disable wrapping for types inside of the MIR
        let mut options = RenderOptions::default().with_max_width(usize::MAX);
        options.format = self.format;

        options
    }
}

/// A wrapper for formatting a type with specific rendering options.
pub(crate) struct Type(TypeId, TypeOptions);

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T, A> FormatPart<Type> for TextFormat<W, S, T, A>
where
    W: io::Write,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
{
    fn format_part(&mut self, Type(r#type, options): Type) -> io::Result<()> {
        self.types
            .as_mut()
            .render_into(r#type, options.render(), &mut self.line_buffer)
    }
}

impl<'body, 'fmt, 'env, 'heap: 'fmt + 'env, W, S, T, A> FormatPart<Signature<'body, 'heap>>
    for TextFormat<W, S, T, A>
where
    W: io::Write,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
{
    fn format_part(&mut self, Signature(body, options): Signature<'body, 'heap>) -> io::Result<()> {
        write!(self.line_buffer, "{} ", source_keyword(body.source))?;
        self.format_part(body.source)?;

        self.line_buffer.write_all(b"(")?;
        self.csv((0..body.args).map(Local::new).map(|local| {
            let decl = body.local_decls[local];

            KeyValuePair(
                local,
                Type(
                    decl.r#type,
                    TypeOptions {
                        format: options.format,
                    },
                ),
            )
        }))?;
        self.line_buffer.write_all(b") -> ")?;
        self.format_part(Type(
            body.return_type,
            TypeOptions {
                format: options.format,
            },
        ))?;

        Ok(())
    }
}

impl<'heap, W, S, T, A> FormatPart<GraphReadHead<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: GraphReadHead<'heap>) -> io::Result<()> {
        match value {
            GraphReadHead::Entity { axis } => {
                self.line_buffer.write_all(b"entities(")?;
                self.format_part(axis)?;
                self.line_buffer.write_all(b")")
            }
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<GraphReadBody> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: GraphReadBody) -> io::Result<()> {
        match value {
            GraphReadBody::Filter(def_id, local) => {
                self.line_buffer.write_all(b"filter(")?;
                self.format_part(def_id)?;
                self.line_buffer.write_all(b", ")?;
                self.format_part(local)?;
                self.line_buffer.write_all(b")")
            }
        }
    }
}

impl<W, S, T, A> FormatPart<GraphReadTail> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: GraphReadTail) -> io::Result<()> {
        match value {
            GraphReadTail::Collect => self.line_buffer.write_all(b"collect"),
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<&GraphRead<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(
        &mut self,
        GraphRead {
            head,
            body,
            tail,
            target: _,
        }: &GraphRead<'heap>,
    ) -> io::Result<()> {
        self.line_buffer.write_all(b"graph read ")?;
        self.format_part(*head)?;

        for &body in body {
            self.newline()?;
            self.indent(2)?;
            self.line_buffer.write_all(b"|> ")?;
            self.format_part(body)?;
        }

        self.newline()?;
        self.indent(2)?;
        self.line_buffer.write_all(b"|> ")?;
        self.format_part(*tail)
    }
}

/// A wrapper for formatting the head (main instruction) part of MIR terminators.
pub(crate) struct TerminatorHead<'terminator, 'heap>(pub &'terminator TerminatorKind<'heap>);

/// A wrapper for formatting the tail (target and arguments) part of MIR terminators.
pub(crate) struct TerminatorTail<'terminator, 'heap>(pub &'terminator TerminatorKind<'heap>);

impl<'heap, W, S, T, A> FormatPart<TerminatorHead<'_, 'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TerminatorHead(kind): TerminatorHead<'_, 'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target: _ }) => write!(self.line_buffer, "goto"),
            &TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets: _,
            }) => {
                write!(self.line_buffer, "switchInt(")?;
                self.format_part(discriminant)?;
                self.line_buffer.write_all(b")")
            }
            &TerminatorKind::Return(Return { value }) => {
                write!(self.line_buffer, "return ")?;
                self.format_part(value)
            }
            TerminatorKind::GraphRead(graph_read) => self.format_part(graph_read),
            TerminatorKind::Unreachable => write!(self.line_buffer, "unreachable"),
        }
    }
}

impl<W, S, T, A> FormatPart<u128> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, value: u128) -> io::Result<()> {
        write!(self.line_buffer, "{value}")
    }
}

impl<'heap, W, S, T, A> FormatPart<TerminatorTail<'_, 'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TerminatorTail(kind): TerminatorTail<'_, 'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target }) => {
                write!(self.line_buffer, " -> ")?;
                self.format_part(target)
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant: _,
                targets,
            }) => {
                write!(self.line_buffer, " -> [")?;
                self.csv(
                    targets
                        .iter()
                        .map(|(value, target)| KeyValuePair(value, target)),
                )?;
                if let Some(otherwise) = targets.otherwise() {
                    write!(self.line_buffer, ", otherwise: ")?;
                    self.format_part(otherwise)?;
                }
                write!(self.line_buffer, "]")
            }
            &TerminatorKind::Return(_) | TerminatorKind::Unreachable => Ok(()),
            TerminatorKind::GraphRead(GraphRead {
                head: _,
                body: _,
                tail: _,
                target,
            }) => {
                write!(self.line_buffer, " -> ")?;
                self.format_part(AnonymousTarget(*target))
            }
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<&Terminator<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Terminator { span: _, kind }: &Terminator<'heap>) -> io::Result<()> {
        self.format_part(TerminatorHead(kind))?;
        self.format_part(TerminatorTail(kind))
    }
}

impl<'heap, W, S, T, A> FormatPart<Binary<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Binary { op, left, right }: Binary<'heap>) -> io::Result<()> {
        self.format_part(left)?;
        write!(self.line_buffer, " {} ", op.as_str())?;
        self.format_part(right)
    }
}

impl<'heap, W, S, T, A> FormatPart<Unary<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Unary { op, operand }: Unary<'heap>) -> io::Result<()> {
        write!(self.line_buffer, "{}", op.as_str())?;
        self.format_part(operand)
    }
}

impl<K, V, W, S, T, A> FormatPart<KeyValuePair<K, V>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    Self: FormatPart<K> + FormatPart<V>,
{
    fn format_part(&mut self, KeyValuePair(key, value): KeyValuePair<K, V>) -> io::Result<()> {
        self.format_part(key)?;
        self.line_buffer.write_all(b": ")?;
        self.format_part(value)
    }
}

impl<'heap, W, S, T, A> FormatPart<&Aggregate<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Aggregate { kind, operands }: &Aggregate<'heap>) -> io::Result<()> {
        match kind {
            AggregateKind::Tuple => {
                self.line_buffer.write_all(b"(")?;
                self.csv(operands.iter().copied())?;
                self.line_buffer.write_all(b")")
            }
            AggregateKind::Struct { fields } => {
                self.line_buffer.write_all(b"(")?;

                self.csv(
                    fields
                        .iter()
                        .zip(operands.iter())
                        .map(|(&key, &value)| KeyValuePair(key, value)),
                )?;

                self.line_buffer.write_all(b")")
            }
            AggregateKind::List => {
                self.line_buffer.write_all(b"list(")?;
                self.csv(operands.iter().copied())?;
                self.line_buffer.write_all(b")")
            }
            AggregateKind::Dict => {
                self.line_buffer.write_all(b"dict(")?;

                self.csv(
                    operands
                        .iter()
                        .copied()
                        .array_chunks()
                        .map(|[key, value]| KeyValuePair(key, value)),
                )?;

                self.line_buffer.write_all(b")")
            }
            AggregateKind::Opaque(symbol) => {
                self.line_buffer.write_all(b"opaque(")?;
                self.line_buffer.write_all(symbol.as_bytes())?;
                self.line_buffer.write_all(b", ")?;
                self.csv(operands.iter().copied())?;
                self.line_buffer.write_all(b")")
            }
            AggregateKind::Closure => {
                self.line_buffer.write_all(b"closure(")?;
                self.csv(operands.iter().copied())?;
                self.line_buffer.write_all(b")")
            }
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<Input<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
{
    fn format_part(&mut self, Input { op, name }: Input<'heap>) -> io::Result<()> {
        self.line_buffer.write_all(b"input ")?;

        match op {
            InputOp::Load { required: _ } => {
                self.line_buffer.write_all(b"LOAD ")?;
            }
            InputOp::Exists => {
                self.line_buffer.write_all(b"EXISTS ")?;
            }
        }

        self.line_buffer.write_all(name.as_bytes())
    }
}

impl<'heap, W, S, T, A> FormatPart<&Apply<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(
        &mut self,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> io::Result<()> {
        self.line_buffer.write_all(b"apply ")?;
        self.format_part(*function)?;

        for argument in arguments {
            self.line_buffer.write_all(b" ")?;
            self.format_part(*argument)?;
        }

        Ok(())
    }
}

impl<'heap, W, S, T, A> FormatPart<&RValue<'heap>> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: &RValue<'heap>) -> io::Result<()> {
        match value {
            &RValue::Load(operand) => self.format_part(operand),
            &RValue::Binary(binary) => self.format_part(binary),
            &RValue::Unary(unary) => self.format_part(unary),
            RValue::Aggregate(aggregate) => self.format_part(aggregate),
            &RValue::Input(input) => self.format_part(input),
            RValue::Apply(apply) => self.format_part(apply),
        }
    }
}

impl<'heap, W, S, T, A> FormatPart<(Location, &Statement<'heap>)> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    A: TextFormatAnnotations,
{
    fn format_part(
        &mut self,
        (location, statement @ Statement { span: _, kind }): (Location, &Statement<'heap>),
    ) -> io::Result<()> {
        self.indent(2)?;

        match kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                self.format_part(*lhs)?;
                self.line_buffer.write_all(b" = ")?;
                self.format_part(rhs)?;
            }
            StatementKind::Nop => self.line_buffer.write_all(b"nop")?,
            &StatementKind::StorageLive(local) => {
                self.line_buffer.write_all(b"let ")?;
                self.format_part(local)?;
            }
            &StatementKind::StorageDead(local) => {
                self.line_buffer.write_all(b"drop ")?;
                self.format_part(local)?;
            }
        }

        let Some(annotation) = self.annotations.annotate_statement(location, statement) else {
            return Ok(());
        };

        // We estimate that we never exceed 80 columns, calculate the remaining width, if we don't
        // have enough space, we add 4 spaces breathing room.
        let remaining_width = 80_usize.checked_sub(self.line_buffer.len()).unwrap_or(4);
        self.line_buffer
            .resize(self.line_buffer.len() + remaining_width, b' ');
        write!(self.line_buffer, "// {annotation}")?;

        Ok(())
    }
}

struct BodyRenderOptions {
    highlight: bool,
}

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T, A> FormatPart<(&Body<'heap>, BodyRenderOptions)>
    for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
    A: TextFormatAnnotations,
{
    fn format_part(
        &mut self,
        (body, options): (&Body<'heap>, BodyRenderOptions),
    ) -> io::Result<()> {
        if options.highlight {
            self.line_buffer.write_all(b"*")?;
        }

        self.format_part(Signature(
            body,
            SignatureOptions {
                format: RenderFormat::Plain,
            },
        ))?;
        self.line_buffer.write_all(b" {")?;
        self.newline()?;

        // Do not render locals that are arguments, as they are already rendered in the signature
        for (local, decl) in body.local_decls.iter_enumerated().skip(body.args) {
            self.indent(1)?;
            write!(self.line_buffer, "let {local}: ")?;
            self.format_part(Type(
                decl.r#type,
                TypeOptions {
                    format: RenderFormat::Plain,
                },
            ))?;

            if let Some(annotation) = self.annotations.annotate_local_decl(local, decl) {
                // We estimate that we never exceed 80 columns, calculate the remaining width, if we
                // don't have enough space, we add 4 spaces breathing room.
                let remaining_width = 80_usize.checked_sub(self.line_buffer.len()).unwrap_or(4);
                self.line_buffer
                    .resize(self.line_buffer.len() + remaining_width, b' ');
                write!(self.line_buffer, "// {annotation}")?;
            }

            self.newline()?;
        }

        if body.local_decls.len() > body.args {
            self.newline()?;
        }

        for (index, block) in body.basic_blocks.iter_enumerated() {
            if index.as_usize() > 0 {
                self.newline()?;
            }

            self.format_part((index, block))?;
        }

        self.line_buffer.write_all(b"}")?;
        Ok(())
    }
}

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T, A>
    FormatPart<(&DefIdSlice<Body<'heap>>, HighlightBody<'_>)> for TextFormat<W, S, T, A>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
    A: TextFormatAnnotations,
{
    fn format_part(
        &mut self,
        (bodies, highlight): (&DefIdSlice<Body<'heap>>, HighlightBody<'_>),
    ) -> io::Result<()> {
        self.separated_list(
            b"\n\n",
            bodies.iter_enumerated().map(|(def, body)| {
                (
                    body,
                    BodyRenderOptions {
                        highlight: highlight.0.contains(&def),
                    },
                )
            }),
        )
    }
}
