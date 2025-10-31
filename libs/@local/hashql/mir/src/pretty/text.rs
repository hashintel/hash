// Textual representation of bodies, based on a similar syntax used by rustc

use std::io;

use hashql_core::{id::Id, symbol::Symbol};
use hashql_hir::node::{r#let::Binder, operation::InputOp};

use super::{SourceLookup, write::WriteValue};
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
        self.write_value(bodies)
    }

    fn separated_list<V>(
        &mut self,
        sep: &[u8],
        values: impl IntoIterator<Item = V>,
    ) -> io::Result<()>
    where
        Self: WriteValue<V>,
    {
        let mut values = values.into_iter();
        let Some(first) = values.next() else {
            return Ok(());
        };

        self.write_value(first)?;

        for value in values {
            self.writer.write_all(sep)?;
            self.write_value(value)?;
        }

        Ok(())
    }

    fn csv<V>(&mut self, values: impl IntoIterator<Item = V>) -> io::Result<()>
    where
        Self: WriteValue<V>,
    {
        self.separated_list(b", ", values)
    }

    fn indent(&mut self, level: usize) -> io::Result<()> {
        write!(self.writer, "{:width$}", "", width = level * self.indent)
    }
}

impl<'heap, W, S> WriteValue<DefId> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: DefId) -> io::Result<()> {
        let source = self.sources.source(value);
        if let Some(source) = source {
            self.write_value(source)
        } else {
            write!(self.writer, "{{def@{value}}}")
        }
    }
}

impl<'heap, W, S> WriteValue<Symbol<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, value: Symbol<'heap>) -> io::Result<()> {
        write!(self.writer, "{value}")
    }
}

impl<W, S> WriteValue<Local> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, value: Local) -> io::Result<()> {
        write!(self.writer, "%{value}")
    }
}

impl<'heap, W, S> WriteValue<Place<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, Place { local, projections }: Place<'heap>) -> io::Result<()> {
        self.write_value(local)?;

        for projection in projections {
            match projection {
                Projection::Field(index) => write!(self.writer, ".{index}")?,
                Projection::FieldByName(symbol) => write!(self.writer, ".{symbol}")?,
                &Projection::Index(local) => {
                    write!(self.writer, "[")?;
                    self.write_value(local)?;
                    write!(self.writer, "]")?;
                }
            }
        }

        Ok(())
    }
}

impl<'heap, W, S> WriteValue<Constant<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: Constant<'heap>) -> io::Result<()> {
        match value {
            Constant::Primitive(primitive) => write!(self.writer, "{primitive}"),
            Constant::Unit => self.writer.write_all(b"()"),
            Constant::FnPtr(def) => {
                self.write_value(def)?;
                self.writer.write_all(b" as FnPtr")
            }
        }
    }
}

impl<'heap, W, S> WriteValue<Operand<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: Operand<'heap>) -> io::Result<()> {
        match value {
            Operand::Place(place) => self.write_value(place),
            Operand::Constant(constant) => self.write_value(constant),
        }
    }
}

impl<'heap, W, S> WriteValue<Source<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, value: Source<'heap>) -> io::Result<()> {
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

impl<'heap, W, S> WriteValue<(BasicBlockId, &BasicBlock<'heap>)> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, (id, block): (BasicBlockId, &BasicBlock<'heap>)) -> io::Result<()> {
        self.indent(1)?;
        write!(self.writer, "bb{id}: {{")?;

        for statement in &block.statements {
            self.write_value(statement)?;
            self.writer.write_all(b"\n")?;
        }

        self.writer.write_all(b"\n")?;
        self.write_value(&block.terminator)?;

        self.indent(1)?;
        write!(self.writer, "}}")?;

        Ok(())
    }
}

impl<'heap, W, S> WriteValue<Target<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Target { block, args }: Target<'heap>) -> io::Result<()> {
        write!(self.writer, "bb{block}(")?;
        self.csv(args.iter().copied())?;
        write!(self.writer, ")")
    }
}

impl<'body, 'heap, W, S> WriteValue<Signature<'body, 'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, Signature(body): Signature<'body, 'heap>) -> io::Result<()> {
        write!(self.writer, "{} ", source_keyword(body.source))?;
        self.write_value(body.source)?;

        self.writer.write_all(b"(")?;
        self.csv((0..body.args).map(Local::new))?;
        self.writer.write_all(b")")?;

        Ok(())
    }
}

impl<'heap, W, S> WriteValue<GraphReadHead<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: GraphReadHead<'heap>) -> io::Result<()> {
        match value {
            GraphReadHead::Entity { axis } => {
                self.writer.write_all(b"entities(")?;
                self.write_value(axis)?;
                self.writer.write_all(b")")
            }
        }
    }
}

impl<'heap, W, S> WriteValue<GraphReadBody> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: GraphReadBody) -> io::Result<()> {
        match value {
            GraphReadBody::Filter(def_id, local) => {
                self.writer.write_all(b"filter(")?;
                self.write_value(def_id)?;
                self.writer.write_all(b", ")?;
                self.write_value(local)?;
                self.writer.write_all(b")")
            }
        }
    }
}

impl<W, S> WriteValue<GraphReadTail> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, value: GraphReadTail) -> io::Result<()> {
        match value {
            GraphReadTail::Collect => self.writer.write_all(b"collect"),
        }
    }
}

impl<'heap, W, S> WriteValue<&GraphRead<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(
        &mut self,
        GraphRead {
            head,
            body,
            tail,
            target,
        }: &GraphRead<'heap>,
    ) -> io::Result<()> {
        self.writer.write_all(b"graph read ")?;
        self.write_value(*head)?;

        for &body in body {
            self.writer.write_all(b"\n")?;
            self.indent(2)?;
            self.writer.write_all(b"|> ")?;
            self.write_value(body)?;
        }

        self.writer.write_all(b"\n")?;
        self.indent(2)?;
        self.writer.write_all(b"|> ")?;
        self.write_value(*tail)?;

        write!(self.writer, " -> bb{target}(_)")
    }
}

impl<'heap, W, S> WriteValue<&Terminator<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Terminator { span: _, kind }: &Terminator<'heap>) -> io::Result<()> {
        match kind {
            &TerminatorKind::Goto(Goto { target }) => {
                write!(self.writer, "goto -> ")?;
                self.write_value(target)
            }
            &TerminatorKind::Branch(Branch { test, then, r#else }) => {
                write!(self.writer, "if(")?;
                self.write_value(test)?;
                write!(self.writer, ") -> [0: ")?;
                self.write_value(r#else)?;
                write!(self.writer, ", 1: ")?;
                self.write_value(then)?;
                write!(self.writer, "]")
            }
            &TerminatorKind::Return(Return { value }) => {
                write!(self.writer, "return ")?;
                self.write_value(value)
            }
            TerminatorKind::GraphRead(graph_read) => self.write_value(graph_read),
            TerminatorKind::Unreachable => write!(self.writer, "-> !"),
        }
    }
}

impl<'heap, W, S> WriteValue<Binary<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Binary { op, left, right }: Binary<'heap>) -> io::Result<()> {
        self.write_value(left)?;
        write!(self.writer, " {} ", op.as_str())?;
        self.write_value(right)
    }
}

impl<'heap, W, S> WriteValue<Unary<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Unary { op, operand }: Unary<'heap>) -> io::Result<()> {
        write!(self.writer, "{}", op.as_str())?;
        self.write_value(operand)
    }
}

impl<'heap, K, V, W, S> WriteValue<KeyValuePair<K, V>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    Self: WriteValue<K> + WriteValue<V>,
{
    fn write_value(&mut self, KeyValuePair(key, value): KeyValuePair<K, V>) -> io::Result<()> {
        self.write_value(key)?;
        self.writer.write_all(b": ")?;
        self.write_value(value)
    }
}

impl<'heap, W, S> WriteValue<&Aggregate<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Aggregate { kind, operands }: &Aggregate<'heap>) -> io::Result<()> {
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

impl<'heap, W, S> WriteValue<Input<'heap>> for TextFormat<W, S>
where
    W: io::Write,
{
    fn write_value(&mut self, Input { op, name }: Input<'heap>) -> io::Result<()> {
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

impl<'heap, W, S> WriteValue<&Apply<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(
        &mut self,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> io::Result<()> {
        self.writer.write_all(b"apply ")?;
        self.write_value(*function)?;

        for argument in arguments.iter() {
            self.writer.write_all(b" ")?;
            self.write_value(*argument)?;
        }

        self.writer.write_all(b")")
    }
}

impl<'heap, W, S> WriteValue<&RValue<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: &RValue<'heap>) -> io::Result<()> {
        match value {
            &RValue::Load(operand) => self.write_value(operand),
            &RValue::Binary(binary) => self.write_value(binary),
            &RValue::Unary(unary) => self.write_value(unary),
            RValue::Aggregate(aggregate) => self.write_value(aggregate),
            &RValue::Input(input) => self.write_value(input),
            RValue::Apply(apply) => self.write_value(apply),
        }
    }
}

impl<'heap, W, S> WriteValue<&Statement<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, Statement { span: _, kind }: &Statement<'heap>) -> io::Result<()> {
        self.indent(2)?;

        match kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                self.write_value(*lhs)?;
                self.writer.write_all(b" = ")?;
                self.write_value(rhs)
            }
            StatementKind::Nop => self.writer.write_all(b"nop"),
            &StatementKind::StorageLive(local) => {
                self.writer.write_all(b"let ")?;
                self.write_value(local)
            }
            &StatementKind::StorageDead(local) => {
                self.writer.write_all(b"drop ")?;
                self.write_value(local)
            }
        }
    }
}

impl<'heap, W, S> WriteValue<&Body<'heap>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: &Body<'heap>) -> io::Result<()> {
        self.write_value(Signature(value))?;
        self.writer.write_all(b" {\n")?;

        for (index, block) in value.basic_blocks.iter_enumerated() {
            if index.as_usize() > 0 {
                self.writer.write_all(b"\n\n")?;
            }

            self.write_value((index, block))?;
        }

        self.writer.write_all(b"}")?;
        Ok(())
    }
}

impl<'heap, W, S> WriteValue<&DefIdSlice<Body<'heap>>> for TextFormat<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    fn write_value(&mut self, value: &DefIdSlice<Body<'heap>>) -> io::Result<()> {
        self.separated_list(b"\n\n", value.iter())
    }
}
