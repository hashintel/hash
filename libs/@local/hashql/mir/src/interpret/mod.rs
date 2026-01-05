use std::{borrow::Cow, rc::Rc};

use self::value::{Dict, List, Opaque, Struct, Tuple, Value};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        local::{Local, LocalVec},
        operand::Operand,
        place::{Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, RValue},
        statement::{Assign, StatementKind},
    },
    def::{DefId, DefIdSlice},
};

mod value;

type LocalValueVec<'heap> = LocalVec<Option<Value<'heap>>>;

struct State<'ctx, 'heap> {
    locals: LocalValueVec<'heap>,

    body: &'ctx Body<'heap>,
    block: &'ctx BasicBlock<'heap>,
    statement_index: usize,
}

fn load_local<'locals, 'heap>(
    locals: &'locals LocalValueVec<'heap>,
    local: Local,
) -> &'locals Value<'heap> {
    locals.lookup(local).expect("local should be initialized")
}

fn load_place<'locals, 'heap>(
    locals: &'locals LocalValueVec<'heap>,
    Place { local, projections }: Place<'heap>,
) -> Cow<'locals, Value<'heap>> {
    let mut value = Cow::Borrowed(load_local(locals, local));
    for &Projection { r#type: _, kind } in projections {
        match kind {
            ProjectionKind::Field(field_index) => {
                value = match value {
                    Cow::Borrowed(value) => Cow::Borrowed(&value[field_index]),
                    Cow::Owned(value) => Cow::Owned(value[field_index].clone()),
                };
            }
            ProjectionKind::FieldByName(symbol) => {
                value = match value {
                    Cow::Borrowed(value) => Cow::Borrowed(&value[symbol]),
                    Cow::Owned(value) => Cow::Owned(value[symbol].clone()),
                };
            }
            ProjectionKind::Index(local) => {
                let index = load_local(locals, local);

                value = match value {
                    Cow::Borrowed(value) => value.subscript(index),
                    Cow::Owned(value) => Cow::Owned(value.subscript(index).into_owned()),
                };
            }
        }
    }

    value
}

fn load_operand<'locals, 'heap>(
    locals: &'locals LocalValueVec<'heap>,
    operand: Operand<'heap>,
) -> Cow<'locals, Value<'heap>> {
    match operand {
        Operand::Place(place) => load_place(locals, place),
        Operand::Constant(constant) => Cow::Owned(Value::from(constant)),
    }
}

fn load_aggregate<'locals, 'heap>(
    locals: &'locals LocalValueVec<'heap>,
    aggregate: Aggregate<'heap>,
) -> Value<'heap> {
    match aggregate.kind {
        AggregateKind::Tuple => {
            let mut values = Vec::with_capacity(aggregate.operands.len());
            for &field in &aggregate.operands {
                values.push(load_operand(locals, field).into_owned());
            }

            Tuple::new(values).map_or(Value::Unit, Value::Tuple)
        }
        AggregateKind::Struct { fields } => {
            debug_assert_eq!(fields.len(), aggregate.operands.len());

            let mut values = Vec::with_capacity(fields.len());
            for operand in &aggregate.operands {
                values.push(load_operand(locals, *operand).into_owned());
            }

            Value::Struct(Struct::new_unchecked(fields, values.into()))
        }
        AggregateKind::List => {
            let mut values = List::new();
            for &field in &aggregate.operands {
                values.push_back(load_operand(locals, field).into_owned());
            }

            Value::List(values)
        }
        AggregateKind::Dict => {
            debug_assert_eq!(aggregate.operands.len() % 2, 0);

            let mut values = Dict::new();
            for [key, value] in aggregate.operands[..].array_windows() {
                let key = load_operand(locals, *key).into_owned();
                let value = load_operand(locals, *value).into_owned();

                values.insert(key, value);
            }

            Value::Dict(values)
        }
        AggregateKind::Opaque(symbol) => {
            debug_assert_eq!(aggregate.operands.len(), 1);

            let value = load_operand(locals, aggregate.operands[0]).into_owned();
            Value::Opaque(Opaque::new(symbol, value))
        }
        AggregateKind::Closure => {
            debug_assert_eq!(aggregate.operands.len(), 2);
            // TODO: properly track them?!
            todo!()
        }
    }
}

fn run<'heap>(
    bodies: &DefIdSlice<Body<'heap>>,
    main: DefId,
    locals: impl ExactSizeIterator<Item = Value<'heap>>,
) {
    let mut callstack = vec![];
    let mut returns = vec![];

    let main = &bodies[main];
    debug_assert_eq!(main.args, locals.len());

    let mut main_locals = LocalVec::with_capacity(locals.len());
    locals.into_iter().map(Some).collect_into(&mut main_locals);

    callstack.push(State {
        locals: main_locals,
        body: main,
        block: &main.basic_blocks[BasicBlockId::START],
        statement_index: 0,
    });

    while let Some(state) = callstack.last_mut() {
        if state.statement_index >= state.block.statements.len() {
            // TODO: we have reached a terminator
        }

        // Execute the next statement (aka the statement we're pointing to)
        let statement = &state.block.statements[state.statement_index];

        if let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind {
            // Get the value to be assigned first, once that is done we get the mutable place where
            // to put it.
            let rhs = match rhs {
                RValue::Load(operand) => load_operand(&state.locals, *operand),
                RValue::Binary(binary) => todo!(),
                RValue::Unary(unary) => todo!(),
                RValue::Aggregate(aggregate) => todo!(),
                RValue::Input(input) => todo!(),
                RValue::Apply(apply) => todo!(),
            };
        }

        state.statement_index += 1;
    }
}
