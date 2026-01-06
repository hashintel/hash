use std::{assert_matches::debug_assert_matches, borrow::Cow};

use hashql_core::{collections::FastHashMap, symbol::Symbol};
use hashql_hir::node::operation::InputOp;

use self::value::{Dict, List, Opaque, Struct, Tuple, Value};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Int,
        local::{Local, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, Projection},
        rvalue::{Aggregate, AggregateKind, Apply, Input, RValue},
        statement::{Assign, StatementKind},
        terminator::{Goto, Return, SwitchInt, Target, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
};

mod error;
mod runtime;
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
        // match kind {
        //     ProjectionKind::Field(field_index) => {
        //         value = match value {
        //             Cow::Borrowed(value) => Cow::Borrowed(&value[field_index]),
        //             Cow::Owned(value) => Cow::Owned(value[field_index].clone()),
        //         };
        //     }
        //     ProjectionKind::FieldByName(symbol) => {
        //         value = match value {
        //             Cow::Borrowed(value) => Cow::Borrowed(&value[symbol]),
        //             Cow::Owned(value) => Cow::Owned(value[symbol].clone()),
        //         };
        //     }
        //     ProjectionKind::Index(local) => {
        //         let index = load_local(locals, local);

        //         todo!()
        //         // value = match value {
        //         //     Cow::Borrowed(value) => value.subscript(index),
        //         //     Cow::Owned(value) => Cow::Owned(value.subscript(index).into_owned()),
        //         // };
        //     }
        // }
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

            let value =
                load_operand(locals, aggregate.operands[FieldIndex::OPAQUE_VALUE]).into_owned();
            Value::Opaque(Opaque::new(symbol, value))
        }
        AggregateKind::Closure => {
            debug_assert_eq!(aggregate.operands.len(), 2);
            // TODO: properly track them as a separate construct? probably?
            todo!()
        }
    }
}

// TODO: actually panic/diagnostic on issue (it's all ICE anyway), with proper unwinding.

fn run<'heap>(
    bodies: &DefIdSlice<Body<'heap>>,
    inputs: &FastHashMap<Symbol<'heap>, Value<'heap>>,
    main: DefId,
    locals: impl ExactSizeIterator<Item = Value<'heap>>,
) -> Value<'heap> {
    let mut callstack = vec![];

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
            let terminator = &state.block.terminator.kind;
            match terminator {
                &TerminatorKind::Goto(Goto {
                    target: Target { block, args },
                }) => {
                    debug_assert_eq!(args.len(), state.body.basic_blocks[block].params.len());

                    for (&param, &arg) in state.body.basic_blocks[block].params.iter().zip(args) {
                        state
                            .locals
                            .insert(param, load_operand(&state.locals, arg).into_owned());
                    }

                    state.block = &state.body.basic_blocks[block];
                    state.statement_index = 0;
                }
                TerminatorKind::SwitchInt(SwitchInt {
                    discriminant,
                    targets,
                }) => {
                    let discriminant = load_operand(&state.locals, *discriminant).into_owned();
                    let Value::Integer(value) = discriminant else {
                        // TODO: should be a diagnostic instead.
                        panic!("diagnostic: SwitchInt discriminant must be an integer");
                    };

                    let Some(Target { block, args }) = targets.target(value.as_uint()) else {
                        // TODO: should be a diagnostic instead.
                        panic!("diagnostic: SwitchInt target not found");
                    };

                    debug_assert_eq!(args.len(), state.body.basic_blocks[block].params.len());
                    for (&param, &arg) in state.body.basic_blocks[block].params.iter().zip(args) {
                        state
                            .locals
                            .insert(param, load_operand(&state.locals, arg).into_owned());
                    }

                    state.block = &state.body.basic_blocks[block];
                    state.statement_index = 0;
                }
                &TerminatorKind::Return(Return { value }) => {
                    // Remove the current state from the callstack
                    let state = callstack.pop().unwrap_or_else(|| unreachable!());
                    let value = load_operand(&state.locals, value).into_owned();

                    let Some(top) = callstack.last_mut() else {
                        // We have reached the top of the callstack, which means that the return
                        // value is the result of the function;
                        return value;
                    };

                    let statement = &top.block.statements[top.statement_index];
                    let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
                        unreachable!("we can only be called from an apply");
                    };
                    debug_assert_matches!(rhs, RValue::Apply(_));

                    // let value = load_place_mut(&mut state.locals, lhs); // TODO: needs to be able
                    // to do assignment on dict
                }
                TerminatorKind::GraphRead(graph_read) => {
                    unimplemented!("this still needs to be implemented")
                }
                TerminatorKind::Unreachable => todo!("diagnostic for this"),
            }

            continue;
        }

        // Execute the next statement (aka the statement we're pointing to)
        let statement = &state.block.statements[state.statement_index];

        if let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind {
            // Get the value to be assigned first, once that is done we get the mutable place where
            // to put it.
            let rhs = match rhs {
                RValue::Load(operand) => load_operand(&state.locals, *operand),
                RValue::Binary(binary) => todo!(), // TODO: implement binary operations
                RValue::Unary(unary) => todo!(),   // TODO: implement unary operations
                RValue::Aggregate(aggregate) => todo!(), // TODO: implement aggregate operations
                RValue::Input(Input { op, name }) => match op {
                    InputOp::Exists => {
                        Cow::Owned(Value::Integer(Int::from(inputs.contains_key(name))))
                    }
                    InputOp::Load { required: _ } => {
                        Cow::Borrowed(&inputs[name]) // TODO: unwind if not exists
                    }
                },
                RValue::Apply(Apply {
                    function,
                    arguments,
                }) => {
                    // Crucially on a function call, we do *not* advance the index, we do so on
                    // re-entry.
                    let function = load_operand(&state.locals, *function);
                    let Value::Pointer(pointer) = function.as_ref() else {
                        panic!("diagnostic: error");
                    };

                    let function_body = &bodies[pointer.def()];

                    let mut function_locals =
                        LocalVec::with_capacity(function_body.local_decls.len());
                    arguments
                        .iter()
                        .map(|&argument| load_operand(&state.locals, argument))
                        .map(Cow::into_owned)
                        .map(Some)
                        .collect_into(&mut function_locals);

                    let state = State {
                        locals: function_locals,
                        body: function_body,
                        block: &function_body.basic_blocks[BasicBlockId::START],
                        statement_index: 0,
                    };

                    callstack.push(state);
                    continue; // We skip the next statement, so we can assign on re-entry.
                }
            };
        }

        state.statement_index += 1;
    }

    todo!("how")
}
