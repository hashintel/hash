// Textual representation of bodies, based on a similar syntax used by rustc

use std::io;

use hashql_core::{id::Id, symbol::Symbol};
use hashql_hir::node::{r#let::Binder, operation::InputOp};

use super::{FormatPart, SourceLookup};
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{Place, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Branch, Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, Return, Target,
            Terminator, TerminatorKind,
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

struct Signature<'body, 'heap>(&'body Body<'heap>);
struct KeyValuePair<K, V>(K, V);

pub struct TextFormat<W, S> {
    pub writer: W,
    pub indent: usize,
    pub sources: S,
}

impl<W, S> TextFormat<W, S>
where
    W: io::Write,
{
    pub fn format<'heap>(&mut self, bodies: &DefIdSlice<Body<'heap>>) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
    {
        self.format_part(bodies)
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

impl<'heap, W, S> FormatPart<DefId> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<&str> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, value: &str) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<'heap, W, S> FormatPart<Symbol<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Symbol<'heap>) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<W, S> FormatPart<Local> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, value: Local) -> io::Result<()> {
        write!(self.writer, "%{value}")
    }
}

impl<'heap, W, S> FormatPart<Place<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, Place { local, projections }: Place<'heap>) -> io::Result<()> {
        self.format_part(local)?;

        for projection in projections {
            match projection {
                Projection::Field(index) => write!(self.writer, ".{index}")?,
                Projection::FieldByName(symbol) => write!(self.writer, ".{symbol}")?,
                &Projection::Index(local) => {
                    write!(self.writer, "[")?;
                    self.format_part(local)?;
                    write!(self.writer, "]")?;
                }
            }
        }

        Ok(())
    }
}

impl<'heap, W, S> FormatPart<Constant<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: Constant<'heap>) -> io::Result<()> {
        match value {
            Constant::Primitive(primitive) => write!(self.writer, "{primitive}"),
            Constant::Unit => self.writer.write_all(b"()"),
            Constant::FnPtr(def) => {
                self.format_part(def)?;
                self.writer.write_all(b" as FnPtr")
            }
        }
    }
}

impl<'heap, W, S> FormatPart<Operand<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<Source<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<(BasicBlockId, &BasicBlock<'heap>)> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, (id, block): (BasicBlockId, &BasicBlock<'heap>)) -> io::Result<()> {
        self.indent(1)?;
        write!(self.writer, "bb{id}: {{\n")?;

        for statement in &block.statements {
            self.format_part(statement)?;
            self.writer.write_all(b"\n")?;
        }

        self.writer.write_all(b"\n")?;
        self.format_part(&block.terminator)?;

        self.indent(1)?;
        write!(self.writer, "}}")?;

        Ok(())
    }
}

impl<'heap, W, S> FormatPart<Target<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Target { block, args }: Target<'heap>) -> io::Result<()> {
        write!(self.writer, "bb{block}(")?;
        self.csv(args.iter().copied())?;
        write!(self.writer, ")")
    }
}

impl<'body, 'heap, W, S> FormatPart<Signature<'body, 'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, Signature(body): Signature<'body, 'heap>) -> io::Result<()> {
        write!(self.writer, "{} ", source_keyword(body.source))?;
        self.format_part(body.source)?;

        self.writer.write_all(b"(")?;
        self.csv((0..body.args).map(Local::new))?;
        self.writer.write_all(b")")?;

        Ok(())
    }
}

impl<'heap, W, S> FormatPart<GraphReadHead<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<GraphReadBody> for TextFormat<W, S>
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

impl<W, S> FormatPart<GraphReadTail> for TextFormat<W, S>
where
    W: io::Write,
{
    fn format_part(&mut self, value: GraphReadTail) -> io::Result<()> {
        match value {
            GraphReadTail::Collect => self.writer.write_all(b"collect"),
        }
    }
}

impl<'heap, W, S> FormatPart<&GraphRead<'heap>> for TextFormat<W, S>
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
            target,
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
        self.format_part(*tail)?;

        write!(self.writer, " -> bb{target}(_)")
    }
}

impl<'heap, W, S> FormatPart<&Terminator<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Terminator { span: _, kind }: &Terminator<'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target }) => {
                write!(self.writer, "goto -> ")?;
                self.format_part(target)
            }
            &TerminatorKind::Branch(Branch { test, then, r#else }) => {
                write!(self.writer, "if(")?;
                self.format_part(test)?;
                write!(self.writer, ") -> [0: ")?;
                self.format_part(r#else)?;
                write!(self.writer, ", 1: ")?;
                self.format_part(then)?;
                write!(self.writer, "]")
            }
            &TerminatorKind::Return(Return { value }) => {
                write!(self.writer, "return ")?;
                self.format_part(value)
            }
            TerminatorKind::GraphRead(graph_read) => self.format_part(graph_read),
            TerminatorKind::Unreachable => write!(self.writer, "-> !"),
        }
    }
}

impl<'heap, W, S> FormatPart<Binary<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<Unary<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, Unary { op, operand }: Unary<'heap>) -> io::Result<()> {
        write!(self.writer, "{}", op.as_str())?;
        self.format_part(operand)
    }
}

impl<'heap, K, V, W, S> FormatPart<KeyValuePair<K, V>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    Self: FormatPart<K> + FormatPart<V>,
{
    fn format_part(&mut self, KeyValuePair(key, value): KeyValuePair<K, V>) -> io::Result<()> {
        self.format_part(key)?;
        self.writer.write_all(b": ")?;
        self.format_part(value)
    }
}

impl<'heap, W, S> FormatPart<&Aggregate<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<Input<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<&Apply<'heap>> for TextFormat<W, S>
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

        self.writer.write_all(b")")
    }
}

impl<'heap, W, S> FormatPart<&RValue<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<&Statement<'heap>> for TextFormat<W, S>
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

impl<'heap, W, S> FormatPart<&Body<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: &Body<'heap>) -> io::Result<()> {
        self.format_part(Signature(value))?;
        self.writer.write_all(b" {\n")?;

        for (index, block) in value.basic_blocks.iter_enumerated() {
            if index.as_usize() > 0 {
                self.writer.write_all(b"\n\n")?;
            }

            self.format_part((index, block))?;
        }

        self.writer.write_all(b"}")?;
        Ok(())
    }
}

impl<'heap, W, S> FormatPart<&DefIdSlice<Body<'heap>>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn format_part(&mut self, value: &DefIdSlice<Body<'heap>>) -> io::Result<()> {
        self.separated_list(b"\n\n", value.iter())
    }
}
