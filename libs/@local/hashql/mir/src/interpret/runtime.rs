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
//! - [`Yield`]: Returned by the interpreter, containing either a final value or a suspension
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
//!
//! # Suspension and Continuation
//!
//! When the interpreter encounters a [`GraphRead`] terminator, it cannot make
//! further progress without external data (e.g., a database query result). Rather
//! than making the interpreter async, it uses a **suspend/resume** protocol:
//!
//! 1. Call [`Runtime::start`] to begin interpretation
//! 2. If it returns [`Yield::Suspension`], inspect the [`Suspension`] to determine what data is
//!    needed
//! 3. Fulfill the request and call [`Runtime::resume`] with the resulting [`Continuation`]
//! 4. Repeat until [`Yield::Return`] is received
//!
//! For callers that can handle suspensions synchronously, [`Runtime::run`] provides
//! a convenience wrapper that drives the loop with a closure.
//!
//! [`GraphRead`]: crate::body::terminator::GraphRead
//! [`Continuation`]: super::suspension::Continuation

use alloc::{alloc::Global, borrow::Cow};
use core::{alloc::Allocator, debug_assert_matches, hint::cold_path, ops::ControlFlow};

use hashql_core::span::SpanId;
use hashql_hir::node::operation::{InputOp, UnOp};

use super::{
    Inputs,
    error::{BinaryTypeMismatch, InterpretDiagnostic, RuntimeError, TypeName, UnaryTypeMismatch},
    locals::Locals,
    scratch::Scratch,
    suspension::{Continuation, Suspension},
    value::{Int, Value},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        rvalue::{Apply, BinOp, Binary, Input, RValue, Unary},
        statement::{Assign, StatementKind},
        terminator::{Goto, GraphReadHead, Return, SwitchInt, Target, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
    interpret::suspension::{self, GraphReadSuspension},
};

/// Creates a new call frame for the given body with the provided arguments.
fn make_frame_in<'ctx, 'heap, E, A: Allocator + Clone>(
    body: &'ctx Body<'heap>,
    args: impl ExactSizeIterator<Item = Result<Value<'heap, A>, E>>,
    alloc: A,
) -> Result<Frame<'ctx, 'heap, A>, E> {
    let locals = Locals::new_in(body, args, alloc)?;

    Ok(Frame {
        locals,
        body,
        current_block: CurrentBlock {
            id: BasicBlockId::START,
            block: &body.basic_blocks[BasicBlockId::START],
        },
        current_statement: 0,
    })
}

/// The current basic block being executed within a frame.
///
/// Caches both the [`BasicBlockId`] and a direct reference to the [`BasicBlock`]
/// to avoid repeated indexing into the body's block storage during execution.
#[derive(Debug, Copy, Clone)]
pub(super) struct CurrentBlock<'ctx, 'heap> {
    pub id: BasicBlockId,
    pub block: &'ctx BasicBlock<'heap>,
}

/// A single call frame in the interpreter's call stack.
///
/// Each frame represents an active function call and tracks:
/// - Local variable storage
/// - The function body being executed
/// - Current position (block and statement index)
pub(super) struct Frame<'ctx, 'heap, A: Allocator> {
    /// Local variable storage for this function call.
    pub locals: Locals<'ctx, 'heap, A>,
    /// The MIR body being executed.
    pub body: &'ctx Body<'heap>,
    /// The current basic block.
    pub current_block: CurrentBlock<'ctx, 'heap>,
    /// Index of the next statement to execute in the current block.
    pub current_statement: usize,
}

/// The call stack for the MIR interpreter.
///
/// Manages the stack of active function calls during interpretation.
///
/// The call stack also provides [`unwind`](Self::unwind) for error reporting,
/// which walks the stack to collect span information for diagnostics.
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "used when resolving the suspension"
)]
pub struct CallStack<'ctx, 'heap, A: Allocator = Global> {
    pub(super) frames: Vec<Frame<'ctx, 'heap, A>, A>,
}

impl<'ctx, 'heap, A: Allocator> CallStack<'ctx, 'heap, A> {
    /// Creates a new call stack with an initial call to the entry function.
    ///
    /// The entry function is called with the provided arguments, which become
    /// the initial values of the function's parameter locals.
    pub fn new(
        runtime: &Runtime<'ctx, 'heap, A>,
        entry: DefId,
        args: impl IntoIterator<Item = Value<'heap, A>, IntoIter: ExactSizeIterator>,
    ) -> Self
    where
        A: Clone,
    {
        let Ok(frame) = runtime.make_frame(entry, args.into_iter().map(Ok::<_, !>));

        let mut frames = Vec::new_in(runtime.alloc.clone());
        frames.push(frame);

        Self { frames }
    }

    /// Creates a new call stack with an initial call to the given body.
    ///
    /// # Errors
    ///
    /// Returns `E` if any argument in `args` is an `Err`.
    pub fn new_in<E>(
        body: &'ctx Body<'heap>,
        args: impl IntoIterator<Item = Result<Value<'heap, A>, E>, IntoIter: ExactSizeIterator>,
        alloc: A,
    ) -> Result<Self, E>
    where
        A: Allocator + Clone,
    {
        let frame = make_frame_in(body, args.into_iter(), alloc.clone())?;
        let mut frames = Vec::new_in(alloc);
        frames.push(frame);

        Ok(Self { frames })
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
            let span = if frame.current_statement >= frame.current_block.block.statements.len() {
                frame.current_block.block.terminator.span
            } else {
                frame.current_block.block.statements[frame.current_statement].span
            };

            (body, span)
        })
    }

    /// Returns the local variable storage for the innermost active call.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::CallstackEmpty`] if there are no active calls.
    pub fn locals<E, R: Allocator>(
        &self,
    ) -> Result<&Locals<'ctx, 'heap, A>, RuntimeError<'heap, E, R>> {
        self.frames
            .last()
            .ok_or(RuntimeError::CallstackEmpty)
            .map(|frame| &frame.locals)
    }

    /// Returns mutable access to the local variable storage for the current call.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::CallstackEmpty`] if there are no active calls.
    pub fn locals_mut<R: Allocator>(
        &mut self,
    ) -> Result<&mut Locals<'ctx, 'heap, A>, RuntimeError<'heap, !, R>> {
        self.frames
            .last_mut()
            .ok_or(RuntimeError::CallstackEmpty)
            .map(|frame| &mut frame.locals)
    }

    /// Returns the [`BasicBlockId`] of the current block.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::CallstackEmpty`] if there are no active calls.
    pub fn current_block<E>(&self) -> Result<BasicBlockId, RuntimeError<'heap, E, A>> {
        self.frames
            .last()
            .map(|frame| frame.current_block.id)
            .ok_or(RuntimeError::CallstackEmpty)
    }

    /// Sets the current block and resets the statement counter to zero.
    ///
    /// The caller must ensure that `block_id` is a valid transition target
    /// in the current execution context. The block itself is bounds-checked
    /// against the body's block storage, but reachability is not verified.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::CallstackEmpty`] if there are no active calls.
    pub fn set_current_block_unchecked<E>(
        &mut self,
        block_id: BasicBlockId,
    ) -> Result<(), RuntimeError<'heap, E, A>> {
        let frame = self.frames.last_mut().ok_or(RuntimeError::CallstackEmpty)?;

        let block = &frame.body.basic_blocks[block_id];

        frame.current_block = CurrentBlock {
            id: block_id,
            block,
        };
        frame.current_statement = 0;

        Ok(())
    }
}

/// Result of running the interpreter until it can no longer make progress.
///
/// The interpreter either completes with a final value or suspends at a point
/// where it needs external data (such as a database query result) before it
/// can continue.
#[derive(Debug)]
pub enum Yield<'ctx, 'heap, A: Allocator> {
    /// The entry function returned a value. Interpretation is complete.
    Return(Value<'heap, A>),
    /// The interpreter suspended and needs external data to continue.
    ///
    /// The caller should inspect the [`Suspension`] to determine what is needed,
    /// fulfill the request, and call [`Runtime::resume`] with the resulting
    /// [`Continuation`].
    Suspension(Suspension<'ctx, 'heap>),
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
    inputs: &'ctx Inputs<'heap, A>,

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
        inputs: &'ctx Inputs<'heap>,
    ) -> Self {
        Self::new_in(config, bodies, inputs, Global)
    }
}

impl<'ctx, 'heap, A: Allocator + Clone> Runtime<'ctx, 'heap, A> {
    /// Creates a new runtime with the given configuration, bodies, inputs, and allocator.
    ///
    /// See [`Runtime::new`] for details on the parameters.
    #[must_use]
    pub fn new_in(
        config: RuntimeConfig,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        inputs: &'ctx Inputs<'heap, A>,
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
        args: impl ExactSizeIterator<Item = Result<Value<'heap, A>, E>>,
    ) -> Result<Frame<'ctx, 'heap, A>, E> {
        make_frame_in(&self.bodies[func], args, self.alloc.clone())
    }

    #[inline]
    fn step_terminator_goto<E>(
        &mut self,
        frame: &mut Frame<'ctx, 'heap, A>,
        Target { block, args }: Target<'heap>,
    ) -> Result<(), RuntimeError<'heap, E, A>> {
        if args.is_empty() {
            frame.current_block = CurrentBlock {
                id: block,
                block: &frame.body.basic_blocks[block],
            };
            frame.current_statement = 0;
            return Ok(());
        }

        debug_assert_eq!(args.len(), frame.body.basic_blocks[block].params.len());

        // We must ensure that the assignments are not clobbered, this may happen in the case that
        // we assign `(b, a)` to `(a, b)` inside of the block params.
        self.scratch.target_args.reserve(args.len());
        frame.body.basic_blocks[block]
            .params
            .iter()
            .zip(args)
            .map(|(&param, arg)| {
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

        frame.current_block = CurrentBlock {
            id: block,
            block: &frame.body.basic_blocks[block],
        };
        frame.current_statement = 0;
        Ok(())
    }

    fn step_terminator<E>(
        &mut self,
        stack: &mut [Frame<'ctx, 'heap, A>],
        frame: &mut Frame<'ctx, 'heap, A>,
    ) -> Result<ControlFlow<Yield<'ctx, 'heap, A>, PopFrame>, RuntimeError<'heap, E, A>> {
        let terminator = &frame.current_block.block.terminator.kind;

        match terminator {
            &TerminatorKind::Goto(Goto { target }) => {
                self.step_terminator_goto(frame, target)?;

                Ok(ControlFlow::Continue(PopFrame::No))
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                let discriminant = frame.locals.operand(discriminant)?;
                let &Value::Integer(int) = discriminant.as_ref() else {
                    cold_path();

                    return Err(RuntimeError::InvalidDiscriminantType {
                        r#type: discriminant.type_name().into(),
                    });
                };

                let Some(target) = targets.target(int.as_uint()) else {
                    cold_path();

                    return Err(RuntimeError::InvalidDiscriminant { value: int });
                };

                self.step_terminator_goto(frame, target)?;
                Ok(ControlFlow::Continue(PopFrame::No))
            }
            TerminatorKind::Return(Return { value }) => {
                let value = frame.locals.operand(value)?.into_owned();

                // No caller frame means we're returning from the entry function.
                let Some(caller) = stack.last_mut() else {
                    // In most cases we just have straight function calls, only the last return is
                    // one that we break on.
                    cold_path();

                    return Ok(ControlFlow::Break(Yield::Return(value)));
                };

                // The caller is suspended at an `Assign` statement with an `Apply` rvalue.
                // We write the return value to the LHS of that assignment and resume.
                let statement = &caller.current_block.block.statements[caller.current_statement];
                let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
                    unreachable!("we can only be called from an apply");
                };
                debug_assert_matches!(rhs, RValue::Apply(_));

                let lhs = caller.locals.place_mut(*lhs, &mut self.scratch)?;
                *lhs = value;

                caller.current_statement += 1;

                Ok(ControlFlow::Continue(PopFrame::Yes))
            }
            TerminatorKind::GraphRead(read) => {
                let axis = match read.head {
                    GraphReadHead::Entity { axis } => frame.locals.operand(&axis)?,
                };

                let axis = suspension::extract_axis(&axis)?;

                Ok(ControlFlow::Break(Yield::Suspension(
                    Suspension::GraphRead(GraphReadSuspension {
                        body: frame.body.id,
                        block: frame.current_block.id,
                        read,
                        axis,
                    }),
                )))
            }
            TerminatorKind::Unreachable => Err(RuntimeError::UnreachableReached),
        }
    }

    fn eval_rvalue_binary<E>(
        frame: &Frame<'ctx, 'heap, A>,
        Binary { op, left, right }: &Binary<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, E, A>> {
        let lhs = frame.locals.operand(left)?;
        let rhs = frame.locals.operand(right)?;

        match op {
            BinOp::Add => match (lhs.as_ref(), rhs.as_ref()) {
                (Value::Integer(lhs), Value::Integer(rhs)) => Ok(Value::from(lhs + rhs)),
                (Value::Integer(lhs), Value::Number(rhs)) => Ok(Value::Number(lhs + rhs)),
                (Value::Number(lhs), Value::Integer(rhs)) => Ok(Value::Number(lhs + rhs)),
                (Value::Number(lhs), Value::Number(rhs)) => Ok(Value::Number(lhs + rhs)),
                _ => {
                    cold_path();

                    Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            op: *op,
                            lhs_expected: TypeName::terse("Number"),
                            rhs_expected: TypeName::terse("Number"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    )))
                }
            },
            BinOp::Sub => match (lhs.as_ref(), rhs.as_ref()) {
                (Value::Integer(lhs), Value::Integer(rhs)) => Ok(Value::from(lhs - rhs)),
                (Value::Integer(lhs), Value::Number(rhs)) => Ok(Value::Number(lhs - rhs)),
                (Value::Number(lhs), Value::Integer(rhs)) => Ok(Value::Number(lhs - rhs)),
                (Value::Number(lhs), Value::Number(rhs)) => Ok(Value::Number(lhs - rhs)),
                _ => {
                    cold_path();

                    Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            op: *op,
                            lhs_expected: TypeName::terse("Number"),
                            rhs_expected: TypeName::terse("Number"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    )))
                }
            },
            BinOp::BitAnd => {
                if let (Value::Integer(lhs), Value::Integer(rhs)) = (lhs.as_ref(), rhs.as_ref()) {
                    Ok(Value::Integer(lhs & rhs))
                } else {
                    cold_path();

                    Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            op: *op,
                            lhs_expected: TypeName::terse("Integer"),
                            rhs_expected: TypeName::terse("Integer"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    )))
                }
            }
            BinOp::BitOr => {
                if let (Value::Integer(lhs), Value::Integer(rhs)) = (lhs.as_ref(), rhs.as_ref()) {
                    Ok(Value::Integer(lhs | rhs))
                } else {
                    cold_path();

                    Err(RuntimeError::BinaryTypeMismatch(Box::new(
                        BinaryTypeMismatch {
                            op: *op,
                            lhs_expected: TypeName::terse("Integer"),
                            rhs_expected: TypeName::terse("Integer"),
                            lhs: lhs.into_owned(),
                            rhs: rhs.into_owned(),
                        },
                    )))
                }
            }
            BinOp::Eq => Ok(Value::Integer(Int::from(lhs == rhs))),
            BinOp::Ne => Ok(Value::Integer(Int::from(lhs != rhs))),
            BinOp::Lt => Ok(Value::Integer(Int::from(lhs < rhs))),
            BinOp::Lte => Ok(Value::Integer(Int::from(lhs <= rhs))),
            BinOp::Gt => Ok(Value::Integer(Int::from(lhs > rhs))),
            BinOp::Gte => Ok(Value::Integer(Int::from(lhs >= rhs))),
        }
    }

    fn eval_rvalue_unary<E>(
        frame: &Frame<'ctx, 'heap, A>,
        Unary { op, operand }: &Unary<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, E, A>> {
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
                | Value::Dict(_) => {
                    cold_path();

                    Err(RuntimeError::UnaryTypeMismatch(Box::new(
                        UnaryTypeMismatch {
                            op: *op,
                            expected: TypeName::terse("Boolean"),
                            value: operand.into_owned(),
                        },
                    )))
                }
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
                | Value::Dict(_) => {
                    cold_path();

                    Err(RuntimeError::UnaryTypeMismatch(Box::new(
                        UnaryTypeMismatch {
                            op: *op,
                            expected: TypeName::terse("Integer"),
                            value: operand.into_owned(),
                        },
                    )))
                }
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
                | Value::Dict(_) => {
                    cold_path();

                    Err(RuntimeError::UnaryTypeMismatch(Box::new(
                        UnaryTypeMismatch {
                            op: *op,
                            expected: TypeName::terse("Number"),
                            value: operand.into_owned(),
                        },
                    )))
                }
            },
        }
    }

    fn eval_rvalue_input<E>(
        &self,
        Input { op, name }: &Input<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, E, A>> {
        match op {
            // `required` is used only by static control-flow analysis; at runtime we always
            // error if the input is missing.
            InputOp::Load { required: _ } => self.inputs.get(*name).map_or_else(
                || Err(RuntimeError::InputNotFound { name: *name }),
                |value| Ok(value.clone()),
            ),
            InputOp::Exists => Ok(Value::Integer(self.inputs.contains(*name).into())),
        }
    }

    fn eval_rvalue_apply<E>(
        &self,
        frame: &Frame<'ctx, 'heap, A>,
        Apply {
            function,
            arguments,
        }: &Apply<'heap>,
    ) -> Result<Frame<'ctx, 'heap, A>, RuntimeError<'heap, E, A>> {
        let function = frame.locals.operand(function)?;
        let Value::Pointer(pointer) = function.as_ref() else {
            return Err(RuntimeError::ApplyNonPointer {
                r#type: function.type_name().into(),
            });
        };

        self.make_frame(
            pointer.def(),
            arguments
                .iter()
                .map(|argument| frame.locals.operand(argument).map(Cow::into_owned)),
        )
    }

    fn eval_rvalue<E>(
        &self,
        frame: &Frame<'ctx, 'heap, A>,
        rvalue: &RValue<'heap>,
    ) -> Result<ControlFlow<Frame<'ctx, 'heap, A>, Value<'heap, A>>, RuntimeError<'heap, E, A>>
    {
        match rvalue {
            RValue::Load(operand) => frame
                .locals
                .operand(operand)
                .map(Cow::into_owned)
                .map(ControlFlow::Continue),
            RValue::Binary(binary) => {
                Self::eval_rvalue_binary(frame, binary).map(ControlFlow::Continue)
            }
            RValue::Unary(unary) => {
                Self::eval_rvalue_unary(frame, unary).map(ControlFlow::Continue)
            }
            RValue::Aggregate(aggregate) => {
                frame.locals.aggregate(aggregate).map(ControlFlow::Continue)
            }
            RValue::Input(input) => self.eval_rvalue_input(input).map(ControlFlow::Continue),
            RValue::Apply(apply) => self.eval_rvalue_apply(frame, apply).map(ControlFlow::Break),
        }
    }

    fn step_statement_assign<E>(
        &mut self,
        frame: &mut Frame<'ctx, 'heap, A>,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Result<Option<Frame<'ctx, 'heap, A>>, RuntimeError<'heap, E, A>> {
        let value = self.eval_rvalue(frame, rhs)?;
        let value = match value {
            ControlFlow::Continue(value) => value,
            ControlFlow::Break(frame) => return Ok(Some(frame)),
        };

        let lhs = frame.locals.place_mut(*lhs, &mut self.scratch)?;
        *lhs = value;

        Ok(None)
    }

    fn step<E>(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<ControlFlow<Yield<'ctx, 'heap, A>>, RuntimeError<'heap, E, A>> {
        let Some((frame, stack)) = callstack.frames.split_last_mut() else {
            return Err(RuntimeError::CallstackEmpty);
        };

        if frame.current_statement >= frame.current_block.block.statements.len() {
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

        let statement = &frame.current_block.block.statements[frame.current_statement];
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

    /// Steps the interpreter until it either returns a value or suspends.
    ///
    /// This is the low-level driver loop. It does **not** clear scratch state,
    /// so callers must call [`reset`](Self::reset) before the first invocation.
    /// Prefer [`start`](Self::start) for the initial invocation and
    /// [`resume`](Self::resume) after fulfilling a suspension.
    ///
    /// # Errors
    ///
    /// Returns a runtime error if interpretation fails.
    pub fn run_until_suspension<E>(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<Yield<'ctx, 'heap, A>, RuntimeError<'heap, E, A>> {
        loop {
            let next = self.step(callstack)?;
            if let ControlFlow::Break(value) = next {
                return Ok(value);
            }
        }
    }

    /// Runs the interpreter until it hits a backend transition point.
    ///
    /// The `continue` callback is invoked at each block boundary in the outermost
    /// call frame. It receives the [`BasicBlockId`] just entered and returns
    /// whether execution should continue on this backend. When it returns `false`,
    /// the method returns [`ControlFlow::Break`] without executing any statements
    /// in that block.
    ///
    /// # Return value
    ///
    /// - [`ControlFlow::Break(())`]: transition point reached. The callstack is positioned at the
    ///   block where `continue` returned `false`.
    /// - [`ControlFlow::Continue(Yield::Return(v))`]: interpretation completed.
    /// - [`ControlFlow::Continue(Yield::Suspension(s))`]: interpreter suspended for external data.
    ///   Apply the continuation and call this method again.
    ///
    /// # Errors
    ///
    /// Returns a runtime error if interpretation fails.
    pub fn run_until_transition<E>(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
        mut r#continue: impl FnMut(BasicBlockId) -> bool,
    ) -> Result<ControlFlow<BasicBlockId, Yield<'ctx, 'heap, A>>, RuntimeError<'heap, E, A>> {
        loop {
            // Check if we've entered a new block in the outermost frame. This must happen
            // *before* stepping so that block transitions from `Continuation::apply` (which
            // sets `current_statement = 0` on the target block) are visible on re-entry.
            // During nested calls (multiple frames) the interpreter runs freely; only
            // top-level block boundaries are transition candidates.
            if let [frame] = &*callstack.frames
                && frame.current_statement == 0
                && !r#continue(frame.current_block.id)
            {
                return Ok(ControlFlow::Break(frame.current_block.id));
            }

            let next = self.step(callstack)?;
            if let ControlFlow::Break(value) = next {
                return Ok(ControlFlow::Continue(value));
            }
        }
    }

    fn try_run(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
        mut on_suspension: impl FnMut(
            Suspension<'ctx, 'heap>,
        )
            -> Result<Continuation<'ctx, 'heap, A>, RuntimeError<'heap, !, A>>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, !, A>> {
        self.scratch.clear();

        loop {
            match self.run_until_suspension(callstack)? {
                Yield::Return(value) => return Ok(value),
                Yield::Suspension(suspension) => {
                    let continuation = on_suspension(suspension)?;
                    continuation.apply(callstack)?;
                }
            }
        }
    }

    /// Runs the interpreter to completion, handling suspensions inline.
    ///
    /// This is a convenience method for callers that can handle all suspensions
    /// synchronously via a closure. The `on_suspension` callback receives each
    /// [`Suspension`], fulfills it, and returns the corresponding [`Continuation`].
    ///
    /// For async or more complex orchestration, use [`start`](Self::start) and
    /// [`resume`](Self::resume) instead.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if interpretation fails or if `on_suspension` returns
    /// an error.
    pub fn run(
        &mut self,
        mut callstack: CallStack<'ctx, 'heap, A>,
        on_suspension: impl FnMut(
            Suspension<'ctx, 'heap>,
        )
            -> Result<Continuation<'ctx, 'heap, A>, RuntimeError<'heap, !, A>>,
    ) -> Result<Value<'heap, A>, InterpretDiagnostic> {
        self.try_run(&mut callstack, on_suspension)
            .map_err(|error| {
                let spans = callstack.unwind();

                error.into_diagnostic(spans.map(|(_, span)| span), |suspension| suspension)
            })
    }

    /// Clears ephemeral scratch state.
    ///
    /// Called automatically by [`start`](Self::start). Callers using the lower-level
    /// [`run_until_suspension`](Self::run_until_suspension) directly must call this
    /// before the first invocation.
    pub fn reset(&mut self) {
        self.scratch.clear();
    }

    /// Begins interpretation from the given call stack.
    ///
    /// Clears scratch state and runs until the interpreter either returns
    /// or suspends. This should be used for the initial invocation; use
    /// [`resume`](Self::resume) to continue after a suspension.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if any runtime error occurs during interpretation.
    pub fn start(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<Yield<'ctx, 'heap, A>, InterpretDiagnostic> {
        self.reset();
        self.run_until_suspension(callstack).map_err(|error| {
            let spans = callstack.unwind();

            error.into_diagnostic(spans.map(|(_, span)| span), |suspension| suspension)
        })
    }

    /// Continues interpretation after a suspension has been fulfilled.
    ///
    /// Resolves the [`Continuation`] into the call stack and resumes stepping
    /// until the interpreter returns or suspends again.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if the continuation is invalid or if a runtime
    /// error occurs during interpretation.
    pub fn resume(
        &mut self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
        continuation: Continuation<'ctx, 'heap, A>,
    ) -> Result<Yield<'ctx, 'heap, A>, InterpretDiagnostic> {
        continuation.apply(callstack).map_err(|error| {
            let spans = callstack.unwind();

            error.into_diagnostic(spans.map(|(_, span)| span), |suspension| suspension)
        })?;

        self.run_until_suspension(callstack).map_err(|error| {
            let spans = callstack.unwind();

            error.into_diagnostic(spans.map(|(_, span)| span), |suspension| suspension)
        })
    }
}
