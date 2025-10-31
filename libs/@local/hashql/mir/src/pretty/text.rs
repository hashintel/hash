// Textual representation of bodies, based on a similar syntax used by rustc

use std::io;

use hashql_core::id::{Id, IdSlice};
use hashql_hir::node::{r#let::Binder, operation::InputOp};

use super::PrettyPrinter;
use crate::{
    body::{
        Body, Source,
        basic_block::BasicBlock,
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Branch, Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail, Return, Target,
            Terminator, TerminatorKind,
        },
    },
    def::DefId,
};

trait SourceLookup<'heap> {
    fn source(&self, def: DefId) -> Option<Source<'heap>>;
}

struct PrettyText<W, S> {
    writer: W,
    indent: usize,
    sources: S,
}

impl<'heap, W, S> PrettyText<W, S>
where
    W: io::Write,
    S: SourceLookup<'heap>,
{
    const fn source_kw(source: Source<'_>) -> &'static str {
        match source {
            Source::Thunk(..) => "thunk",
            Source::Ctor(_) | Source::Closure(..) | Source::Intrinsic(_) => "fn",
        }
    }

    fn local(&mut self, local: Local) -> io::Result<()> {
        write!(self.writer, "%{local}")
    }

    fn place(&mut self, Place { local, projections }: Place) -> io::Result<()> {
        self.local(local)?;

        for projection in projections {
            match projection {
                Projection::Field(index) => write!(self.writer, ".{index}")?,
                Projection::FieldByName(symbol) => write!(self.writer, ".{symbol}")?,
                &Projection::Index(local) => {
                    write!(self.writer, "[")?;
                    self.local(local)?;
                    write!(self.writer, "]")?;
                }
            }
        }

        Ok(())
    }

    fn def(&mut self, def: DefId) -> io::Result<()> {
        let source = self.sources.source(def);
        if let Some(source) = source {
            self.source(source)
        } else {
            write!(self.writer, "{{def@{def}}}")
        }
    }

    fn constant(&mut self, constant: Constant) -> io::Result<()> {
        match constant {
            Constant::Primitive(primitive) => write!(self.writer, "{primitive}"),
            Constant::Unit => self.writer.write_all(b"()"),
            Constant::FnPtr(def) => {
                self.def(def)?;
                self.writer.write_all(b" as FnPtr")
            }
        }
    }

    fn operand(&mut self, operand: Operand) -> io::Result<()> {
        match operand {
            Operand::Place(place) => self.place(place),
            Operand::Constant(constant) => self.constant(constant),
        }
    }

    fn source(&mut self, source: Source<'_>) -> io::Result<()> {
        let mut named_symbol = |name, id, binder: Option<Binder<'_>>| {
            if let Some(binder) = binder {
                if let Some(name) = binder.name {
                    return self.writer.write_all(name.as_bytes());
                }

                return write!(self.writer, "{{{name}#{}}}", binder.id);
            }

            write!(self.writer, "{{{name}@{id}}}")
        };

        match source {
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

    fn body_signature(&mut self, body: &Body) -> io::Result<()> {
        write!(self.writer, "{} ", Self::source_kw(body.source))?;
        self.source(body.source)?;

        for i in 0..body.args {
            if i > 0 {
                self.writer.write_all(b", ")?;
            }

            self.local(Local::new(i))?;
        }

        Ok(())
    }

    fn indent(&mut self, level: usize) -> io::Result<()> {
        write!(self.writer, "{:width$}", "", width = level * self.indent)
    }

    fn basic_block(&mut self, index: usize, block: &BasicBlock) -> io::Result<()> {
        self.indent(1)?;
        write!(self.writer, "bb{index}: {{")?;

        for statement in &block.statements {
            self.statement(statement)?;
            self.writer.write_all(b"\n")?;
        }

        self.writer.write_all(b"\n")?;
        self.terminator(&block.terminator)?;

        self.indent(1)?;
        write!(self.writer, "}}")?;

        Ok(())
    }

    fn target(&mut self, target: Target) -> io::Result<()> {
        write!(self.writer, "bb{}(", target.block)?;

        self.csv(target.args.iter(), |this, &operand| this.operand(operand))?;

        write!(self.writer, ")")
    }

    fn graph_read_head(&mut self, head: GraphReadHead) -> io::Result<()> {
        match head {
            GraphReadHead::Entity { axis } => {
                self.writer.write_all(b"entities(")?;
                self.operand(axis)?;
                self.writer.write_all(b")")
            }
        }
    }

    fn graph_read_body(&mut self, body: GraphReadBody) -> io::Result<()> {
        match body {
            GraphReadBody::Filter(def_id, local) => {
                self.writer.write_all(b"filter(")?;
                self.def(def_id)?;
                self.writer.write_all(b", ")?;
                self.local(local)?;
                self.writer.write_all(b")")
            }
        }
    }

    fn graph_read_tail(&mut self, tail: GraphReadTail) -> io::Result<()> {
        match tail {
            GraphReadTail::Collect => self.writer.write_all(b"collect"),
        }
    }

    fn graph_read(
        &mut self,
        GraphRead {
            head,
            body,
            tail,
            target,
        }: &GraphRead,
    ) -> io::Result<()> {
        self.writer.write_all(b"graph read ")?;
        self.graph_read_head(*head)?;

        for &body in body {
            self.writer.write_all(b"\n")?;
            self.indent(2)?;
            self.writer.write_all(b"|> ")?;
            self.graph_read_body(body)?;
        }

        self.writer.write_all(b"\n")?;
        self.indent(2)?;
        self.writer.write_all(b"|> ")?;
        self.graph_read_tail(*tail)?;

        write!(self.writer, " -> bb{target}(_)")
    }

    fn terminator(&mut self, terminator: &Terminator) -> io::Result<()> {
        match &terminator.kind {
            &TerminatorKind::Goto(Goto { target }) => {
                write!(self.writer, "goto -> ")?;
                self.target(target)
            }
            &TerminatorKind::Branch(Branch { test, then, r#else }) => {
                write!(self.writer, "if(")?;
                self.operand(test)?;
                write!(self.writer, ") -> [0: ")?;
                self.target(r#else)?;
                write!(self.writer, ", 1: ")?;
                self.target(then)?;
                write!(self.writer, "]")
            }
            &TerminatorKind::Return(Return { value }) => {
                write!(self.writer, "return ")?;
                self.operand(value)
            }
            TerminatorKind::GraphRead(graph_read) => self.graph_read(graph_read),
            TerminatorKind::Unreachable => write!(self.writer, "-> !"),
        }
    }

    fn binary(&mut self, Binary { op, left, right }: Binary) -> io::Result<()> {
        self.operand(left)?;
        write!(self.writer, " {} ", op.as_str())?;
        self.operand(right)
    }

    fn unary(&mut self, Unary { op, operand }: Unary) -> io::Result<()> {
        write!(self.writer, "{}", op.as_str())?;
        self.operand(operand)
    }

    fn csv<I>(
        &mut self,
        items: impl IntoIterator<Item = I>,
        mut on_item: impl FnMut(&mut Self, I) -> io::Result<()>,
    ) -> io::Result<()> {
        let mut first = true;
        for item in items {
            if !first {
                self.writer.write_all(b", ")?;
            }

            on_item(self, item)?;
            first = false;
        }
        Ok(())
    }

    fn aggregate(&mut self, Aggregate { kind, operands }: &Aggregate) -> io::Result<()> {
        match kind {
            AggregateKind::Tuple => {
                self.writer.write_all(b"(")?;
                self.csv(operands.iter(), |this, operand| this.operand(*operand))?;
                self.writer.write_all(b")")
            }
            AggregateKind::Struct { fields } => {
                self.writer.write_all(b"(")?;

                self.csv(
                    fields.iter().zip(operands.iter()),
                    |this, (field, operand)| {
                        this.writer.write_all(field.as_bytes())?;
                        this.writer.write_all(b": ")?;
                        this.operand(*operand)
                    },
                )?;

                self.writer.write_all(b")")
            }
            AggregateKind::List => {
                self.writer.write_all(b"list(")?;
                self.csv(operands.iter(), |this, operand| this.operand(*operand))?;
                self.writer.write_all(b")")
            }
            AggregateKind::Dict => {
                self.writer.write_all(b"dict(")?;

                self.csv(
                    operands.iter().copied().array_chunks(),
                    |this, [key, value]| {
                        this.operand(key)?;
                        this.writer.write_all(b": ")?;
                        this.operand(value)
                    },
                )?;

                self.writer.write_all(b")")
            }
            AggregateKind::Opaque(symbol) => {
                self.writer.write_all(b"opaque(")?;
                self.writer.write_all(symbol.as_bytes())?;
                self.writer.write_all(b", ")?;

                self.writer.write_all(b")")
            }
            AggregateKind::Closure => {
                self.writer.write_all(b"closure(")?;
                self.csv(operands.iter(), |this, operand| this.operand(*operand))?;
                self.writer.write_all(b")")
            }
        }
    }

    fn input(&mut self, Input { op, name }: &Input) -> io::Result<()> {
        self.writer.write_all(b"input ")?;

        match op {
            InputOp::Load { required: _ } => {
                self.writer.write_all(b"LOAD ")?;
            }
            InputOp::Exists => {
                self.writer.write_all(b"EXISTS ")?;
            }
        }

        self.writer.write_all(name.as_bytes())?;
        self.writer.write_all(b")")
    }

    fn apply(
        &mut self,
        Apply {
            function,
            arguments,
        }: &Apply,
    ) -> io::Result<()> {
        self.writer.write_all(b"apply ")?;
        self.operand(*function)?;

        for (i, argument) in arguments.iter().enumerate() {
            if i > 0 {
                self.writer.write_all(b" ")?;
            }

            self.operand(*argument)?;
        }

        self.writer.write_all(b")")
    }

    fn rvalue(&mut self, rvalue: &RValue) -> io::Result<()> {
        match rvalue {
            &RValue::Load(operand) => self.operand(operand),
            &RValue::Binary(binary) => self.binary(binary),
            &RValue::Unary(unary) => self.unary(unary),
            RValue::Aggregate(aggregate) => self.aggregate(aggregate),
            RValue::Input(input) => self.input(input),
            RValue::Apply(apply) => self.apply(apply),
        }
    }

    fn statement(&mut self, statement: &Statement) -> io::Result<()> {
        self.indent(2)?;

        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                self.place(*lhs)?;
                self.writer.write_all(b" = ")?;
                self.rvalue(rhs)
            }
            StatementKind::Nop => self.writer.write_all(b"nop"),
            &StatementKind::StorageLive(local) => {
                self.writer.write_all(b"let ")?;
                self.local(local)
            }
            &StatementKind::StorageDead(local) => {
                self.writer.write_all(b"drop ")?;
                self.local(local)
            }
        }
    }

    fn body(&mut self, body: &Body) -> io::Result<()> {
        self.body_signature(body)?;
        self.writer.write_all(b" {\n")?;

        for (index, block) in body.basic_blocks.iter().enumerate() {
            if index > 0 {
                self.writer.write_all(b"\n\n")?;
            }

            self.basic_block(index, block)?;
        }

        self.writer.write_all(b"}")?;
        Ok(())
    }
}
