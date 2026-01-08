//! Runtime execution engine for MIR interpretation.
//!
//! This module provides the core execution machinery for interpreting MIR code.
//! It implements a stack-based interpreter that steps through basic blocks,
//! executing statements and following terminators.
//!
//! # Key Types
//!
//! - [`Runtime`]: The main interpreter, holding configuration, function bodies, and inputs
//! - [`RuntimeConfig`]: Configuration options like recursion limits
//! - [`CallStack`]: Manages call frames during execution
//!
//! # Execution Model
//!
//! The interpreter executes MIR by:
//!
//! 1. Starting at the entry block of the entry function
//! 2. Executing statements in order (assignments, storage markers)
//! 3. Following terminators to navigate between blocks
//! 4. Pushing/popping call frames for function calls and returns
//! 5. Returning the final value when the entry function returns

use alloc::{alloc::Global, borrow::Cow};
use core::{alloc::Allocator, assert_matches::debug_assert_matches, ops::ControlFlow};

use hashql_core::{collections::FastHashMap, span::SpanId, symbol::Symbol};
use hashql_hir::node::operation::{InputOp, UnOp};

use super::{
    error::{BinaryTypeMismatch, InterpretDiagnostic, RuntimeError, TypeName, UnaryTypeMismatch},
    locals::Locals,
    scratch::Scratch,
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

/// A single call frame in the interpreter's call stack.
///
/// Each frame represents an active function call and tracks:
/// - Local variable storage
/// - The function body being executed
/// - Current position (block and statement index)
struct Frame<'ctx, 'heap, A: Allocator> {
    /// Local variable storage for this function call.
    locals: Locals<'ctx, 'heap, A>,
    /// The MIR body being executed.
    body: &'ctx Body<'heap>,
    /// The current basic block.
    current_block: &'ctx BasicBlock<'heap>,
    /// Index of the next statement to execute in the current block.
    current_statement: usize,
}

/// The call stack for the MIR interpreter.
///
/// Manages the stack of active function calls during interpretation.
///
/// The call stack also provides [`unwind`](Self::unwind) for error reporting,
/// which walks the stack to collect span information for diagnostics.
pub struct CallStack<'ctx, 'heap, A: Allocator = Global> {
    frames: Vec<Frame<'ctx, 'heap, A>, A>,
}

impl<'ctx, 'heap, A: Allocator> CallStack<'ctx, 'heap, A> {
    /// Creates a new call stack with an initial call to the entry function.
    ///
    /// The entry function is called with the provided arguments, which become
    /// the initial values of the function's parameter locals.
    pub fn new(
        runtime: &Runtime<'ctx, 'heap, A>,
        entry: DefId,
        args: impl IntoIterator<Item = Value<'heap, A>>,
    ) -> Self
    where
        A: Clone,
    {
        let Ok(frame) = runtime.make_frame(entry, args.into_iter().map(Ok::<_, !>));

        let mut frames = Vec::new_in(runtime.alloc.clone());
        frames.push(frame);

        Self { frames }
    }

    /// Unwinds the call stack to produce a trace of definition IDs and spans.
    ///
    /// Returns an iterator over `(DefId, SpanId)` pairs, starting from the
    /// innermost (most recent) call frame. This is used for error reporting
    /// to show where an error occurred and the chain of calls that led to it.
    ///
    /// The span for each frame is either the current statement's span or the
    /// terminator's span if all statements have been executed.
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

/// Internal signal indicating whether to pop the current frame after a terminator.
enum PopFrame {
    /// Pop the current frame (function returned).
    Yes,
    /// Keep the current frame (control flow within function).
    No,
}

/// Configuration options for the MIR interpreter.
///
/// Controls resource limits and other runtime behavior.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct RuntimeConfig {
    /// Maximum call stack depth before raising a recursion limit error.
    ///
    /// When the call stack would exceed this depth, interpretation stops
    /// with a recursion limit exceeded error.
    ///
    /// Default: 1024.
    pub recursion_limit: usize,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            recursion_limit: 1024,
        }
    }
}

/// The MIR interpreter runtime.
///
/// Executes MIR code by stepping through basic blocks, handling statements
/// and terminators, and managing function calls. The runtime holds:
///
/// - Configuration options (recursion limits, etc.)
/// - All function bodies available for execution
/// - Input values that can be loaded by [`Input`] rvalues
///
/// # Usage
///
/// 1. Create a runtime with [`Runtime::new`]
/// 2. Create a call stack with [`CallStack::new`] targeting the entry function
/// 3. Execute with [`Runtime::run`] to get the result
///
/// [`Input`]: crate::body::rvalue::Input
pub struct Runtime<'ctx, 'heap, A: Allocator = Global> {
    alloc: A,

    /// Runtime configuration.
    config: RuntimeConfig,
    /// All available function bodies, indexed by [`DefId`].
    bodies: &'ctx DefIdSlice<Body<'heap>>,
    /// Input values available for [`InputOp::Load`] operations.
    inputs: FastHashMap<Symbol<'heap>, Value<'heap, A>>,

    scratch: Scratch<'heap, A>,
}

impl<'ctx, 'heap> Runtime<'ctx, 'heap> {
    /// Creates a new runtime with the given configuration, bodies, and inputs.
    ///
    /// The `bodies` slice must contain all functions that may be called during
    /// interpretation. The `inputs` map provides values for input operations.
    #[must_use]
    #[inline]
    pub fn new(
        config: RuntimeConfig,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        inputs: FastHashMap<Symbol<'heap>, Value<'heap>>,
    ) -> Self {
        Self::new_in(config, bodies, inputs, Global)
    }
}

impl<'ctx, 'heap, A: Allocator + Clone> Runtime<'ctx, 'heap, A> {
    #[must_use]
    pub fn new_in(
        config: RuntimeConfig,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        inputs: FastHashMap<Symbol<'heap>, Value<'heap, A>>,
        alloc: A,
    ) -> Self {
        Self {
            alloc: alloc.clone(),
            config,
            bodies,
            inputs,
            scratch: Scratch::new_in(alloc),
        }
    }

    fn make_frame<E>(
        &self,
        func: DefId,
        args: impl IntoIterator<Item = Result<Value<'heap, A>, E>>,
    ) -> Result<Frame<'ctx, 'heap, A>, E> {
        let body = &self.bodies[func];
        let locals = Locals::new_in(body, args, self.alloc.clone())?;

        Ok(Frame {
            locals,
            body,
            current_block: &body.basic_blocks[BasicBlockId::START],
            current_statement: 0,
        })
    }

    fn step_terminator_goto(
        &mut self,
        frame: &mut Frame<'ctx, 'heap, A>,
        Target { block, args }: Target<'heap>,
    ) -> Result<(), RuntimeError<'heap, A>> {
        debug_assert_eq!(args.len(), frame.body.basic_blocks[block].params.len());

        // We must not clobber the params, re-assignment makes it that we might re-assign in the
        // case that it isn't in strict SSA.
        frame.body.basic_blocks[block]
            .params
            .iter()
            .zip(args)
            .map(|(&param, &arg)| {
                frame
                    .locals
                    .operand(arg)
                    .map(Cow::into_owned)
                    .map(|value| (param, value))
            })
            .try_fold(&mut self.scratch.target_args, |acc, res| {
                acc.push(res?);
                Ok(acc)
            })?;

        for (param, value) in self.scratch.target_args.drain(..) {
            frame.locals.insert(param, value);
        }

        frame.current_block = &frame.body.basic_blocks[block];
        frame.current_statement = 0;
        Ok(())
    }

    fn step_terminator(
        &mut self,
        stack: &mut [Frame<'ctx, 'heap, A>],
        frame: &mut Frame<'ctx, 'heap, A>,
    ) -> Result<ControlFlow<Value<'heap, A>, PopFrame>, RuntimeError<'heap, A>> {
        let terminator = &frame.current_block.terminator.kind;

        match terminator {
            &TerminatorKind::Goto(Goto { target }) => {
                self.step_terminator_goto(frame, target)?;

                Ok(ControlFlow::Continue(PopFrame::No))
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                let discriminant = frame.locals.operand(*discriminant)?;
                let &Value::Integer(int) = discriminant.as_ref() else {
                    return Err(RuntimeError::InvalidDiscriminantType {
                        r#type: discriminant.type_name().into(),
                    });
                };

                let Some(target) = targets.target(int.as_uint()) else {
                    return Err(RuntimeError::InvalidDiscriminant { value: int });
                };

                self.step_terminator_goto(frame, target)?;
                Ok(ControlFlow::Continue(PopFrame::No))
            }
            &TerminatorKind::Return(Return { value }) => {
                let value = frame.locals.operand(value)?.into_owned();

                // No caller frame means we're returning from the entry function.
                let Some(caller) = stack.last_mut() else {
                    return Ok(ControlFlow::Break(value));
                };

                // The caller is suspended at an `Assign` statement with an `Apply` rvalue.
                // We write the return value to the LHS of that assignment and resume.
                let statement = &caller.current_block.statements[caller.current_statement];
                let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
                    unreachable!("we can only be called from an apply");
                };
                debug_assert_matches!(rhs, RValue::Apply(_));

                let lhs = caller.locals.place_mut(*lhs, &mut self.scratch)?;
                *lhs = value;

                caller.current_statement += 1;

                Ok(ControlFlow::Continue(PopFrame::Yes))
            }
            TerminatorKind::GraphRead(_) => {
                unimplemented!("GraphRead terminator not implemented")
            }
            TerminatorKind::Unreachable => Err(RuntimeError::UnreachableReached),
        }
    }

    fn eval_rvalue_binary(
        frame: &Frame<'ctx, 'heap, A>,
        Binary { op, left, right }: Binary<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>> {
        let lhs = frame.locals.operand(left)?;
        let rhs = frame.locals.operand(right)?;

        let value = match op {
            BinOp::BitAnd => {
                return match (lhs.as_ref(), rhs.as_ref()) {
                    (Value::Integer(lhs), Value::Integer(rhs)) => Ok(Value::Integer(lhs & rhs)),
                    _ => Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            op,
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
                            op,
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
        frame: &Frame<'ctx, 'heap, A>,
        Unary { op, operand }: Unary<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>> {
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
                        op,
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
                        op,
                        expected: TypeName::terse("Integer"),
                        value: operand.into_owned(),
                    },
                ))),
            },
            UnOp::Neg => match operand.as_ref() {
                Value::Integer(int) => Ok((-int).into()),
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
                        op,
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
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>> {
        match op {
            // `required` is used only by static control-flow analysis; at runtime we always
            // error if the input is missing.
            InputOp::Load { required: _ } => self.inputs.get(name).map_or_else(
                || Err(RuntimeError::InputNotFound { name: *name }),
                |value| Ok(value.clone()),
            ),
            InputOp::Exists => Ok(Value::Integer(self.inputs.contains_key(name).into())),
        }
    }

    fn eval_rvalue_apply(
        &self,
        frame: &Frame<'ctx, 'heap, A>,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> Result<Frame<'ctx, 'heap, A>, RuntimeError<'heap, A>> {
        let function = frame.locals.operand(*function)?;
        let &Value::Pointer(pointer) = function.as_ref() else {
            return Err(RuntimeError::ApplyNonPointer {
                r#type: function.type_name().into(),
            });
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
        frame: &Frame<'ctx, 'heap, A>,
        rvalue: &RValue<'heap>,
    ) -> Result<ControlFlow<Frame<'ctx, 'heap, A>, Value<'heap, A>>, RuntimeError<'heap, A>> {
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
        &mut self,
        frame: &mut Frame<'ctx, 'heap, A>,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Result<Option<Frame<'ctx, 'heap, A>>, RuntimeError<'heap, A>> {
        let value = self.eval_rvalue(frame, rhs)?;
        let value = match value {
            ControlFlow::Continue(value) => value,
            ControlFlow::Break(frame) => return Ok(Some(frame)),
        };

        let lhs = frame.locals.place_mut(*lhs, &mut self.scratch)?;
        *lhs = value;

        Ok(None)
    }

    fn step(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<ControlFlow<Value<'heap, A>>, RuntimeError<'heap, A>> {
        let Some((frame, stack)) = callstack.frames.split_last_mut() else {
            return Err(RuntimeError::CallstackEmpty);
        };

        if frame.current_statement >= frame.current_block.statements.len() {
            let next = self.step_terminator(stack, frame)?;

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

        if callstack.frames.len() >= self.config.recursion_limit {
            return Err(RuntimeError::RecursionLimitExceeded {
                limit: self.config.recursion_limit,
            });
        }

        callstack.frames.push(frame);
        Ok(ControlFlow::Continue(()))
    }

    /// Executes the MIR starting from the given call stack.
    ///
    /// Runs the interpreter until the entry function returns or an error occurs.
    /// The call stack should be initialized with [`CallStack::new`] pointing to
    /// the entry function.
    ///
    /// # Returns
    ///
    /// The value returned by the entry function.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if any runtime error occurs. The diagnostic includes
    /// the error message and a call stack trace for error localization.
    pub fn run(
        &mut self,
        mut callstack: CallStack<'ctx, 'heap, A>,
    ) -> Result<Value<'heap, A>, InterpretDiagnostic> {
        loop {
            let result = self.step(&mut callstack);
            let next = match result {
                Ok(next) => next,
                Err(error) => {
                    let spans = callstack.unwind();

                    return Err(error.into_diagnostic(spans.map(|(_, span)| span)));
                }
            };

            if let ControlFlow::Break(value) = next {
                return Ok(value);
            }
        }
    }
}
