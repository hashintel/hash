// Textual representation of bodies, based on a similar syntax used by rustc

use std::io;

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
        local::Local,
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
        Source::Ctor(_) | Source::Closure(..) | Source::Intrinsic(_) => "fn",
    }
}

pub(crate) struct SignatureOptions {
    pub format: RenderFormat,
}

/// A wrapper for formatting function signatures from MIR bodies.
pub(crate) struct Signature<'body, 'heap>(pub &'body Body<'heap>, pub SignatureOptions);

/// A helper struct for formatting key-value pairs with consistent syntax.
struct KeyValuePair<K, V>(K, V);

pub(crate) struct HighlightBody<'def>(pub &'def [DefId]);

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
pub struct TextFormat<W, S, T> {
    /// The writer where formatted text will be written
    pub writer: W,
    /// Amount of indention per level
    pub indent: usize,
    /// Source lookup for resolving symbols and identifiers
    pub sources: S,
    /// Type formatter for formatting type information
    pub types: T,
}

impl<W, S, T> TextFormat<W, S, T>
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
    {
        self.format_part((bodies, HighlightBody(highlight)))
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
            self.writer.write_all(sep)?;
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
        write!(self.writer, "{:width$}", "", width = level * self.indent)
    }
}

impl<'heap, W, S, T> FormatPart<DefId> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: DefId) -> io::Result<()> {
        let source = self.sources.source(value);
        if let Some(source) = source {
            self.format_part(source)
        } else {
            write!(self.writer, "{{def@{value}}}")
        }
    }
}

impl<W, S, T> FormatPart<&str> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: &str) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<'heap, W, S, T> FormatPart<Symbol<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Symbol<'heap>) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<W, S, T> FormatPart<Local> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Local) -> io::Result<()> {
        write!(self.writer, "%{value}")
    }
}

impl<'heap, W, S, T> FormatPart<Place<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, Place { local, projections }: Place<'heap>) -> io::Result<()> {
        self.format_part(local)?;

        for projection in projections {
            match projection.kind {
                ProjectionKind::Field(index) => write!(self.writer, ".{index}")?,
                ProjectionKind::FieldByName(symbol) => write!(self.writer, ".{symbol}")?,
                ProjectionKind::Index(local) => {
                    write!(self.writer, "[")?;
                    self.format_part(local)?;
                    write!(self.writer, "]")?;
                }
            }
        }

        Ok(())
    }
}

impl<'heap, W, S, T> FormatPart<Constant<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: Constant<'heap>) -> io::Result<()> {
        match value {
            Constant::Int(int) => write!(self.writer, "{int}"),
            Constant::Primitive(primitive) => write!(self.writer, "{primitive}"),
            Constant::Unit => self.writer.write_all(b"()"),
            Constant::FnPtr(def) => {
                self.writer.write_all(b"(")?;
                self.format_part(def)?;
                self.writer.write_all(b" as FnPtr)")
            }
        }
    }
}

impl<'heap, W, S, T> FormatPart<Operand<'heap>> for TextFormat<W, S, T>
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

impl<'heap, W, S, T> FormatPart<Source<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Source<'heap>) -> io::Result<()> {
        let mut named_symbol = |name, id, binder: Option<Binder<'_>>| {
            if let Some(binder) = binder {
                if let Some(name) = binder.name {
                    return self.writer.write_all(name.as_bytes());
                }

                return write!(self.writer, "{{{name}#{}}}", binder.id);
            }

            write!(self.writer, "{{{name}@{id}}}")
        };

        match value {
            Source::Ctor(symbol) => {
                write!(self.writer, "{{ctor#{symbol}}}")
            }
            Source::Closure(id, binder) => named_symbol("closure", id, binder),
            Source::Thunk(id, binder) => named_symbol("thunk", id, binder),
            Source::Intrinsic(def_id) => {
                write!(self.writer, "{{intrinsic#{def_id}}}")
            }
        }
    }
}

impl<'heap, W, S, T> FormatPart<(BasicBlockId, &BasicBlock<'heap>)> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, (id, block): (BasicBlockId, &BasicBlock<'heap>)) -> io::Result<()> {
        self.indent(1)?;

        write!(self.writer, "bb{id}(")?;
        self.csv(block.params.iter().copied())?;
        writeln!(self.writer, "): {{")?;

        for statement in &block.statements {
            self.format_part(statement)?;
            self.writer.write_all(b"\n")?;
        }

        if !block.statements.is_empty() {
            self.writer.write_all(b"\n")?;
        }

        self.indent(2)?;
        self.format_part(&block.terminator)?;
        self.writer.write_all(b"\n")?;

        self.indent(1)?;
        writeln!(self.writer, "}}")?;

        Ok(())
    }
}

/// A wrapper for formatting target parameters in MIR terminators.
pub(crate) struct TargetParams<'heap>(pub Interned<'heap, [Operand<'heap>]>);

impl<'heap, W, S, T> FormatPart<TargetParams<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TargetParams(args): TargetParams<'heap>) -> io::Result<()> {
        write!(self.writer, "(")?;
        self.csv(args.iter().copied())?;
        write!(self.writer, ")")
    }
}

impl<'heap, W, S, T> FormatPart<Target<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Target { block, args }: Target<'heap>) -> io::Result<()> {
        write!(self.writer, "bb{block}")?;
        self.format_part(TargetParams(args))
    }
}

struct AnonymousTarget(BasicBlockId);

impl<'heap, W, S, T> FormatPart<AnonymousTarget> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, AnonymousTarget(id): AnonymousTarget) -> io::Result<()> {
        write!(self.writer, "bb{id}(_)")
    }
}

pub(crate) struct TypeOptions {
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

pub(crate) struct Type(TypeId, TypeOptions);

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T> FormatPart<Type> for TextFormat<W, S, T>
where
    W: io::Write,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
{
    fn format_part(&mut self, Type(r#type, options): Type) -> io::Result<()> {
        self.types
            .as_mut()
            .render_into(r#type, options.render(), &mut self.writer)
    }
}

impl<'body, 'fmt, 'env, 'heap: 'fmt + 'env, W, S, T> FormatPart<Signature<'body, 'heap>>
    for TextFormat<W, S, T>
where
    W: io::Write,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
{
    fn format_part(&mut self, Signature(body, options): Signature<'body, 'heap>) -> io::Result<()> {
        write!(self.writer, "{} ", source_keyword(body.source))?;
        self.format_part(body.source)?;

        self.writer.write_all(b"(")?;
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
        self.writer.write_all(b") -> ")?;
        self.format_part(Type(
            body.return_type,
            TypeOptions {
                format: options.format,
            },
        ))?;

        Ok(())
    }
}

impl<'heap, W, S, T> FormatPart<GraphReadHead<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: GraphReadHead<'heap>) -> io::Result<()> {
        match value {
            GraphReadHead::Entity { axis } => {
                self.writer.write_all(b"entities(")?;
                self.format_part(axis)?;
                self.writer.write_all(b")")
            }
        }
    }
}

impl<'heap, W, S, T> FormatPart<GraphReadBody> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: GraphReadBody) -> io::Result<()> {
        match value {
            GraphReadBody::Filter(def_id, local) => {
                self.writer.write_all(b"filter(")?;
                self.format_part(def_id)?;
                self.writer.write_all(b", ")?;
                self.format_part(local)?;
                self.writer.write_all(b")")
            }
        }
    }
}

impl<W, S, T> FormatPart<GraphReadTail> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: GraphReadTail) -> io::Result<()> {
        match value {
            GraphReadTail::Collect => self.writer.write_all(b"collect"),
        }
    }
}

impl<'heap, W, S, T> FormatPart<&GraphRead<'heap>> for TextFormat<W, S, T>
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
        self.writer.write_all(b"graph read ")?;
        self.format_part(*head)?;

        for &body in body {
            self.writer.write_all(b"\n")?;
            self.indent(2)?;
            self.writer.write_all(b"|> ")?;
            self.format_part(body)?;
        }

        self.writer.write_all(b"\n")?;
        self.indent(2)?;
        self.writer.write_all(b"|> ")?;
        self.format_part(*tail)
    }
}

/// A wrapper for formatting the head (main instruction) part of MIR terminators.
pub(crate) struct TerminatorHead<'terminator, 'heap>(pub &'terminator TerminatorKind<'heap>);

/// A wrapper for formatting the tail (target and arguments) part of MIR terminators.
pub(crate) struct TerminatorTail<'terminator, 'heap>(pub &'terminator TerminatorKind<'heap>);

impl<'heap, W, S, T> FormatPart<TerminatorHead<'_, 'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TerminatorHead(kind): TerminatorHead<'_, 'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target: _ }) => write!(self.writer, "goto"),
            &TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets: _,
            }) => {
                write!(self.writer, "switchInt(")?;
                self.format_part(discriminant)?;
                self.writer.write_all(b")")
            }
            &TerminatorKind::Return(Return { value }) => {
                write!(self.writer, "return ")?;
                self.format_part(value)
            }
            TerminatorKind::GraphRead(graph_read) => self.format_part(graph_read),
            TerminatorKind::Unreachable => write!(self.writer, "unreachable"),
        }
    }
}

impl<W, S, T> FormatPart<u128> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, value: u128) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<'heap, W, S, T> FormatPart<TerminatorTail<'_, 'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, TerminatorTail(kind): TerminatorTail<'_, 'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target }) => {
                write!(self.writer, " -> ")?;
                self.format_part(target)
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant: _,
                targets,
            }) => {
                write!(self.writer, " -> [")?;
                self.csv(
                    targets
                        .iter()
                        .map(|(value, target)| KeyValuePair(value, target)),
                )?;
                if let Some(otherwise) = targets.otherwise() {
                    write!(self.writer, ", otherwise: ")?;
                    self.format_part(otherwise)?;
                }
                write!(self.writer, "]")
            }
            &TerminatorKind::Return(_) | TerminatorKind::Unreachable => Ok(()),
            TerminatorKind::GraphRead(GraphRead {
                head: _,
                body: _,
                tail: _,
                target,
            }) => {
                write!(self.writer, " -> ")?;
                self.format_part(AnonymousTarget(*target))
            }
        }
    }
}

impl<'heap, W, S, T> FormatPart<&Terminator<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Terminator { span: _, kind }: &Terminator<'heap>) -> io::Result<()> {
        self.format_part(TerminatorHead(kind))?;
        self.format_part(TerminatorTail(kind))
    }
}

impl<'heap, W, S, T> FormatPart<Binary<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Binary { op, left, right }: Binary<'heap>) -> io::Result<()> {
        self.format_part(left)?;
        write!(self.writer, " {} ", op.as_str())?;
        self.format_part(right)
    }
}

impl<'heap, W, S, T> FormatPart<Unary<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Unary { op, operand }: Unary<'heap>) -> io::Result<()> {
        write!(self.writer, "{}", op.as_str())?;
        self.format_part(operand)
    }
}

impl<K, V, W, S, T> FormatPart<KeyValuePair<K, V>> for TextFormat<W, S, T>
where
    W: io::Write,
    Self: FormatPart<K> + FormatPart<V>,
{
    fn format_part(&mut self, KeyValuePair(key, value): KeyValuePair<K, V>) -> io::Result<()> {
        self.format_part(key)?;
        self.writer.write_all(b": ")?;
        self.format_part(value)
    }
}

impl<'heap, W, S, T> FormatPart<&Aggregate<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Aggregate { kind, operands }: &Aggregate<'heap>) -> io::Result<()> {
        match kind {
            AggregateKind::Tuple => {
                self.writer.write_all(b"(")?;
                self.csv(operands.iter().copied())?;
                self.writer.write_all(b")")
            }
            AggregateKind::Struct { fields } => {
                self.writer.write_all(b"(")?;

                self.csv(
                    fields
                        .iter()
                        .zip(operands.iter())
                        .map(|(&key, &value)| KeyValuePair(key, value)),
                )?;

                self.writer.write_all(b")")
            }
            AggregateKind::List => {
                self.writer.write_all(b"list(")?;
                self.csv(operands.iter().copied())?;
                self.writer.write_all(b")")
            }
            AggregateKind::Dict => {
                self.writer.write_all(b"dict(")?;

                self.csv(
                    operands
                        .iter()
                        .copied()
                        .array_chunks()
                        .map(|[key, value]| KeyValuePair(key, value)),
                )?;

                self.writer.write_all(b")")
            }
            AggregateKind::Opaque(symbol) => {
                self.writer.write_all(b"opaque(")?;
                self.writer.write_all(symbol.as_bytes())?;
                self.writer.write_all(b", ")?;
                self.csv(operands.iter().copied())?;
                self.writer.write_all(b")")
            }
            AggregateKind::Closure => {
                self.writer.write_all(b"closure(")?;
                self.csv(operands.iter().copied())?;
                self.writer.write_all(b")")
            }
        }
    }
}

impl<'heap, W, S, T> FormatPart<Input<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
{
    fn format_part(&mut self, Input { op, name }: Input<'heap>) -> io::Result<()> {
        self.writer.write_all(b"input ")?;

        match op {
            InputOp::Load { required: _ } => {
                self.writer.write_all(b"LOAD ")?;
            }
            InputOp::Exists => {
                self.writer.write_all(b"EXISTS ")?;
            }
        }

        self.writer.write_all(name.as_bytes())
    }
}

impl<'heap, W, S, T> FormatPart<&Apply<'heap>> for TextFormat<W, S, T>
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
        self.writer.write_all(b"apply ")?;
        self.format_part(*function)?;

        for argument in arguments.iter() {
            self.writer.write_all(b" ")?;
            self.format_part(*argument)?;
        }

        Ok(())
    }
}

impl<'heap, W, S, T> FormatPart<&RValue<'heap>> for TextFormat<W, S, T>
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

impl<'heap, W, S, T> FormatPart<&Statement<'heap>> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Statement { span: _, kind }: &Statement<'heap>) -> io::Result<()> {
        self.indent(2)?;

        match kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                self.format_part(*lhs)?;
                self.writer.write_all(b" = ")?;
                self.format_part(rhs)
            }
            StatementKind::Nop => self.writer.write_all(b"nop"),
            &StatementKind::StorageLive(local) => {
                self.writer.write_all(b"let ")?;
                self.format_part(local)
            }
            &StatementKind::StorageDead(local) => {
                self.writer.write_all(b"drop ")?;
                self.format_part(local)
            }
        }
    }
}

struct BodyRenderOptions {
    highlight: bool,
}

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T> FormatPart<(&Body<'heap>, BodyRenderOptions)>
    for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
{
    fn format_part(
        &mut self,
        (body, options): (&Body<'heap>, BodyRenderOptions),
    ) -> io::Result<()> {
        if options.highlight {
            self.writer.write_all(b"*")?;
        }

        self.format_part(Signature(
            body,
            SignatureOptions {
                format: RenderFormat::Plain,
            },
        ))?;
        self.writer.write_all(b" {\n")?;

        // Do not render locals that are arguments, as they are already rendered in the signature
        for (local, decl) in body.local_decls.iter_enumerated().skip(body.args) {
            self.indent(1)?;
            write!(self.writer, "let %{local}: ")?;
            self.format_part(Type(
                decl.r#type,
                TypeOptions {
                    format: RenderFormat::Plain,
                },
            ))?;
            self.writer.write_all(b"\n")?;
        }

        if body.local_decls.len() > body.args {
            self.writer.write_all(b"\n")?;
        }

        for (index, block) in body.basic_blocks.iter_enumerated() {
            if index.as_usize() > 0 {
                self.writer.write_all(b"\n")?;
            }

            self.format_part((index, block))?;
        }

        self.writer.write_all(b"}")?;
        Ok(())
    }
}

impl<'fmt, 'env, 'heap: 'fmt + 'env, W, S, T>
    FormatPart<(&DefIdSlice<Body<'heap>>, HighlightBody<'_>)> for TextFormat<W, S, T>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    T: AsMut<TypeFormatter<'fmt, 'env, 'heap>>,
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
