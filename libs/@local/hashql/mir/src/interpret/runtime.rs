use alloc::borrow::Cow;
use core::{assert_matches::debug_assert_matches, ops::ControlFlow};

use hashql_core::{collections::FastHashMap, span::SpanId, symbol::Symbol};
use hashql_hir::node::operation::{InputOp, UnOp};

use super::{
    error::{BinaryTypeMismatch, RuntimeError, TypeName, UnaryTypeMismatch},
    locals::Locals,
    value::Value,
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        rvalue::{Apply, BinOp, Binary, Input, RValue, Unary},
        statement::{Assign, StatementKind},
        terminator::{Goto, Return, SwitchInt, Target, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
};

struct Frame<'ctx, 'heap> {
    locals: Locals<'ctx, 'heap>,

    body: &'ctx Body<'heap>,
    current_block: &'ctx BasicBlock<'heap>,
    current_statement: usize,
}

pub struct CallStack<'ctx, 'heap> {
    frames: Vec<Frame<'ctx, 'heap>>,
}

impl<'ctx, 'heap> CallStack<'ctx, 'heap> {
    pub fn new(
        runtime: &Runtime<'ctx, 'heap>,
        entry: DefId,
        args: impl IntoIterator<Item = Value<'heap>>,
    ) -> Self {
        let Ok(frame) = runtime.make_frame(entry, args.into_iter().map(Ok::<_, !>));

        Self {
            frames: vec![frame],
        }
    }

    pub fn unwind(&self) -> impl Iterator<Item = (DefId, SpanId)> {
        self.frames.iter().rev().map(|frame| {
            let body = frame.body.id;
            let span = if frame.current_statement >= frame.current_block.statements.len() {
                frame.current_block.terminator.span
            } else {
                frame.current_block.statements[frame.current_statement].span
            };

            (body, span)
        })
    }
}

enum PopFrame {
    Yes,
    No,
}

pub struct Runtime<'ctx, 'heap> {
    bodies: &'ctx DefIdSlice<Body<'heap>>,
    inputs: FastHashMap<Symbol<'heap>, Value<'heap>>,
}

impl<'ctx, 'heap> Runtime<'ctx, 'heap> {
    #[must_use]
    pub const fn new(
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        inputs: FastHashMap<Symbol<'heap>, Value<'heap>>,
    ) -> Self {
        Self { bodies, inputs }
    }

    fn make_frame<E>(
        &self,
        func: DefId,
        args: impl IntoIterator<Item = Result<Value<'heap>, E>>,
    ) -> Result<Frame<'ctx, 'heap>, E> {
        let body = &self.bodies[func];
        let locals = Locals::new(body, args)?;

        Ok(Frame {
            locals,
            body,
            current_block: &body.basic_blocks[BasicBlockId::START],
            current_statement: 0,
        })
    }

    fn step_terminator_goto(
        frame: &mut Frame<'ctx, 'heap>,
        Target { block, args }: Target<'heap>,
    ) -> Result<(), RuntimeError<'heap>> {
        debug_assert_eq!(args.len(), frame.body.basic_blocks[block].params.len());

        for (&param, &arg) in frame.body.basic_blocks[block].params.iter().zip(args) {
            let value = frame.locals.operand(arg)?.into_owned();

            frame.locals.insert(param, value);
        }

        frame.current_block = &frame.body.basic_blocks[block];
        frame.current_statement = 0;
        Ok(())
    }

    fn step_terminator(
        stack: &mut [Frame<'ctx, 'heap>],
        frame: &mut Frame<'ctx, 'heap>,
    ) -> Result<ControlFlow<Value<'heap>, PopFrame>, RuntimeError<'heap>> {
        let terminator = &frame.current_block.terminator.kind;

        match terminator {
            &TerminatorKind::Goto(Goto { target }) => {
                Self::step_terminator_goto(frame, target)?;

                Ok(ControlFlow::Continue(PopFrame::No))
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                let discriminant = frame.locals.operand(*discriminant)?;
                let &Value::Integer(int) = discriminant.as_ref() else {
                    return Err(RuntimeError::InvalidDiscriminantType(
                        discriminant.type_name().into(),
                    ));
                };

                let Some(target) = targets.target(int.as_uint()) else {
                    return Err(RuntimeError::InvalidDiscriminant(int));
                };

                Self::step_terminator_goto(frame, target)?;
                Ok(ControlFlow::Continue(PopFrame::No))
            }
            &TerminatorKind::Return(Return { value }) => {
                // depends on the return value, this is either:
                // A) if underlying frame exists: set the value of the underlying frame
                // B) return the value to the caller
                let value = frame.locals.operand(value)?.into_owned();

                // In any case this means that we need to pop the frame, because we already the
                // frames mutably, we need to remove stuff.
                let Some(top) = stack.last_mut() else {
                    return Ok(ControlFlow::Break(value));
                };

                let statement = &top.current_block.statements[top.current_statement];
                let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
                    unreachable!("we can only be called from an apply");
                };
                debug_assert_matches!(rhs, RValue::Apply(_));

                let lhs = frame.locals.place_mut(*lhs)?;
                *lhs = value;

                // increase the statement index, as we have "finished" this statement
                // completes the apply suspend call
                top.current_statement += 1;

                Ok(ControlFlow::Continue(PopFrame::Yes))
            }
            TerminatorKind::GraphRead(_) => {
                unimplemented!("GraphRead terminator not implemented")
            }
            TerminatorKind::Unreachable => Err(RuntimeError::UnreachableReached),
        }
    }

    fn eval_rvalue_binary(
        frame: &Frame<'ctx, 'heap>,
        Binary { op, left, right }: Binary<'heap>,
    ) -> Result<Value<'heap>, RuntimeError<'heap>> {
        let lhs = frame.locals.operand(left)?;
        let rhs = frame.locals.operand(right)?;

        let value = match op {
            BinOp::BitAnd => {
                return match (lhs.as_ref(), rhs.as_ref()) {
                    (Value::Integer(lhs), Value::Integer(rhs)) => Ok(Value::Integer(lhs & rhs)),
                    _ => Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            lhs_expected: TypeName::terse("Integer"),
                            rhs_expected: TypeName::terse("Integer"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    ))),
                };
            }
            BinOp::BitOr => {
                return match (lhs.as_ref(), rhs.as_ref()) {
                    (Value::Integer(lhs), Value::Integer(rhs)) => Ok(Value::Integer(lhs | rhs)),
                    _ => Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            lhs_expected: TypeName::terse("Integer"),
                            rhs_expected: TypeName::terse("Integer"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    ))),
                };
            }
            BinOp::Eq => lhs == rhs,
            BinOp::Ne => lhs != rhs,
            BinOp::Lt => lhs < rhs,
            BinOp::Lte => lhs <= rhs,
            BinOp::Gt => lhs > rhs,
            BinOp::Gte => lhs >= rhs,
        };

        Ok(Value::Integer(value.into()))
    }

    fn eval_rvalue_unary(
        frame: &Frame<'ctx, 'heap>,
        Unary { op, operand }: Unary<'heap>,
    ) -> Result<Value<'heap>, RuntimeError<'heap>> {
        let operand = frame.locals.operand(operand)?;

        match op {
            UnOp::Not => match operand.as_ref() {
                Value::Integer(int) if let Some(bool) = int.as_bool() => {
                    Ok(Value::Integer((!bool).into()))
                }
                Value::Unit
                | Value::Integer(_)
                | Value::Number(_)
                | Value::String(_)
                | Value::Pointer(_)
                | Value::Opaque(_)
                | Value::Struct(_)
                | Value::Tuple(_)
                | Value::List(_)
                | Value::Dict(_) => Err(RuntimeError::UnaryTypeMismatch(Box::new(
                    UnaryTypeMismatch {
                        expected: TypeName::terse("Boolean"),
                        value: operand.into_owned(),
                    },
                ))),
            },
            UnOp::BitNot => match operand.as_ref() {
                Value::Integer(int) => Ok(Value::Integer(!int)),
                Value::Unit
                | Value::Number(_)
                | Value::String(_)
                | Value::Pointer(_)
                | Value::Opaque(_)
                | Value::Struct(_)
                | Value::Tuple(_)
                | Value::List(_)
                | Value::Dict(_) => Err(RuntimeError::UnaryTypeMismatch(Box::new(
                    UnaryTypeMismatch {
                        expected: TypeName::terse("Integer"),
                        value: operand.into_owned(),
                    },
                ))),
            },
            UnOp::Neg => match operand.as_ref() {
                Value::Integer(int) => Ok(Value::Integer(-int)),
                Value::Number(number) => Ok(Value::Number(-number)),
                Value::Unit
                | Value::String(_)
                | Value::Pointer(_)
                | Value::Opaque(_)
                | Value::Struct(_)
                | Value::Tuple(_)
                | Value::List(_)
                | Value::Dict(_) => Err(RuntimeError::UnaryTypeMismatch(Box::new(
                    UnaryTypeMismatch {
                        expected: TypeName::terse("Number"),
                        value: operand.into_owned(),
                    },
                ))),
            },
        }
    }

    fn eval_rvalue_input(
        &self,
        Input { op, name }: &Input<'heap>,
    ) -> Result<Value<'heap>, RuntimeError<'heap>> {
        match op {
            InputOp::Load { required: _ } => self.inputs.get(name).map_or_else(
                || Err(RuntimeError::InputNotFound(*name)),
                |value| Ok(value.clone()),
            ),
            InputOp::Exists => Ok(Value::Integer(self.inputs.contains_key(name).into())),
        }
    }

    fn eval_rvalue_apply(
        &self,
        frame: &Frame<'ctx, 'heap>,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> Result<Frame<'ctx, 'heap>, RuntimeError<'heap>> {
        let function = frame.locals.operand(*function)?;
        let &Value::Pointer(pointer) = function.as_ref() else {
            return Err(RuntimeError::ApplyNonPointer(function.type_name().into()));
        };

        self.make_frame(
            pointer.def(),
            arguments
                .iter()
                .copied()
                .map(|argument| frame.locals.operand(argument).map(Cow::into_owned)),
        )
    }

    fn eval_rvalue(
        &self,
        frame: &Frame<'ctx, 'heap>,
        rvalue: &RValue<'heap>,
    ) -> Result<ControlFlow<Frame<'ctx, 'heap>, Value<'heap>>, RuntimeError<'heap>> {
        match rvalue {
            &RValue::Load(operand) => frame
                .locals
                .operand(operand)
                .map(Cow::into_owned)
                .map(ControlFlow::Continue),
            &RValue::Binary(binary) => {
                Self::eval_rvalue_binary(frame, binary).map(ControlFlow::Continue)
            }
            &RValue::Unary(unary) => {
                Self::eval_rvalue_unary(frame, unary).map(ControlFlow::Continue)
            }
            RValue::Aggregate(aggregate) => {
                frame.locals.aggregate(aggregate).map(ControlFlow::Continue)
            }
            RValue::Input(input) => self.eval_rvalue_input(input).map(ControlFlow::Continue),
            RValue::Apply(apply) => self.eval_rvalue_apply(frame, apply).map(ControlFlow::Break),
        }
    }

    fn step_statement_assign(
        &self,
        frame: &mut Frame<'ctx, 'heap>,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Result<Option<Frame<'ctx, 'heap>>, RuntimeError<'heap>> {
        let value = self.eval_rvalue(frame, rhs)?;
        let value = match value {
            ControlFlow::Continue(value) => value,
            ControlFlow::Break(frame) => return Ok(Some(frame)),
        };

        let lhs = frame.locals.place_mut(*lhs)?;
        *lhs = value;

        Ok(None)
    }

    fn step(
        &self,
        callstack: &mut CallStack<'ctx, 'heap>,
    ) -> Result<ControlFlow<Value<'heap>>, RuntimeError<'heap>> {
        let Some((frame, stack)) = callstack.frames.split_last_mut() else {
            return Err(RuntimeError::CallstackEmpty);
        };

        if frame.current_statement >= frame.current_block.statements.len() {
            let next = Self::step_terminator(stack, frame)?;

            return match next {
                ControlFlow::Continue(PopFrame::Yes) => {
                    callstack.frames.pop();
                    Ok(ControlFlow::Continue(()))
                }
                ControlFlow::Continue(PopFrame::No) => Ok(ControlFlow::Continue(())),
                ControlFlow::Break(value) => Ok(ControlFlow::Break(value)),
            };
        }

        let statement = &frame.current_block.statements[frame.current_statement];
        let next_frame = match &statement.kind {
            StatementKind::Assign(assign) => self.step_statement_assign(frame, assign)?,
            StatementKind::Nop | StatementKind::StorageLive(_) | StatementKind::StorageDead(_) => {
                None
            }
        };

        let Some(frame) = next_frame else {
            frame.current_statement += 1;
            return Ok(ControlFlow::Continue(()));
        };

        callstack.frames.push(frame);
        Ok(ControlFlow::Continue(()))
    }

    pub fn run(
        &self,
        mut callstack: CallStack<'ctx, 'heap>,
    ) -> Result<Value<'heap>, RuntimeError<'heap>> {
        loop {
            let result = self.step(&mut callstack);
            let next = match result {
                Ok(next) => next,
                Err(error) => {
                    let spans = callstack.unwind();

                    todo!("convert to diagnostic")
                }
            };

            if let ControlFlow::Break(value) = next {
                return Ok(value);
            }
        }
    }
}
