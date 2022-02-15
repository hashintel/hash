//! Packages are able to execute logic on the runners through the use of [`Task`] objects.
//!
//! # General Flow
//!
//! Tasks are created within the implementation of a Package, from there they are then sent to the
//! [`workerpool`], which in turn distributes it to [`worker`]s as necessary, which then execute the
//! task across the Language Runners. The Language Runners call the Package's implementations in the
//! respective language (e.g. _package.py_) and after a [`Task`] has finished executing, its results
//! follow a similar path back up the chain to the main Package impl. This allows Packages to be
//! fully in control of their respective logic in any of the supported languages, the structure of
//! the [`Task`] objects, and the structure of all [`TaskMessages`] sent between the various
//! components.
//!
//! For the initial message to a Language Runner, the [`WorkerHandler::start_message`]
//! trait method is called to create the first instance of the [`TargetedTaskMessage`] which has a
//! [`MessageTarget`] of `Python`, `JavaScript`, `Rust`, `Dynamic`, or `Main` (Refer to the docs on
//! the enum for further implementation details, especially around the `Dynamic` variant). This is
//! then sent to the package implementation in the respective target language. For example, a
//! [`TargetedTaskMessage`] with a target of [`MessageTarget::Python`] will be executed through the
//! `package.py` script found within the Package folder. Once the task has executed on the target, a
//! new [`TargetedTaskMessage`] is then returned with a new target. The execution continues in a
//! similar fashion, where [`TargetedTaskMessage`]s are sent to their appropriate destination until
//! one is received which is targeted at [`MessageTarget::Main`] which marks the end of the
//! execution.
//!
//! [`worker`]: crate::worker
//! [`workerpool`]: crate::workerpool
//! [`MessageTarget`]: crate::worker::runner::comms::MessageTarget
//! [`MessageTarget::Python`]: crate::worker::runner::comms::MessageTarget::Python
//! [`MessageTarget::Main`]: crate::worker::runner::comms::MessageTarget::Main
//!
//! # Specifics and Usage
//!
//! ## Task Variants and Structure, and Package Implementation
//!
//! The design aims to allow a package to be in complete control of the implementation of the
//! [`Task`] logic, only abstracting the actual execution specifics away. Because of this, the
//! structure and contents of the specific [`Task`] object is controlled by the package
//! implementation.
//!
//! To allow this, and to enable the generalised interfaces around [`Task`] sending logic,
//! [`enum_dispatch`] is used to provide functionality like dynamic-dispatch without the added
//! overhead. To achieve this, each [`Task`] struct of a Package, is a variant of the Package group
//! (e.g. [`InitTask`]), which is then in turn a variant of of the [`Task`] enum. Each of these
//! variants are then required to implement the following traits (look at the docs for the traits
//! to see more details) which provide information on the specification of a [`Task`], and methods
//! on how to handle its execution:
//!  - [`GetTaskName`],
//!  - [`WorkerHandler`],
//!  - [`WorkerPoolHandler`],
//!  - [`GetTaskArgs`],
//!  - [`StoreAccessVerify`]
//!
//! [`enum_dispatch`]: crate::simulation::enum_dispatch
//!
//! ## Task Distribution
//!
//! A [`Task`]'s execution can be split up across multiple workers if the [`Task`] is marked as
//! being distributed through the [`GetTaskArgs::distribution`] trait method. If this is the case,
//! then [`new_worker_subtasks`](crate::workerpool::new_worker_subtasks) breaks the [`Task`] up
//! into new smaller [`Task`]s, by calling the package-implemented
//! [`WorkerPoolHandler::split_task`] method. It distributes [`AgentBatch`]es as configured, and
//! then executes those individual sub-tasks on multiple workers.
//!
//! As each sub-task finishes executing, it's handled by
//! [`PendingWorkerPoolTask::handle_result_state`] which calls the package-implemented
//! [`WorkerPoolHandler::combine_messages`] method once all of the sub-tasks have returned. This
//! method then creates one final [`TaskMessage`] which is returned to the package implementation.
//!
//! Note: [`Task`]s are also automatically further split-up _within_ [`worker`]s according to the
//! `Group`s of agents they're being executed on. More information can be found on the
//! [`WorkerController::spawn_task()`] docs.
//!
//! [`AgentBatch`]: crate::datastore::batch::agent::Batch
//! [`PendingWorkerPoolTask::handle_result_state`]: crate::workerpool::pending::PendingWorkerPoolTask::handle_result_state
//! [`WorkerController::spawn_task()`]: crate::worker::WorkerController::spawn_task
pub mod access;
pub mod active;
pub mod args;
pub mod cancel;
pub mod handler;
pub mod msg;

use crate::simulation::enum_dispatch::*;

// All traits applied here apply to the enum.
// Also we have automatically derived all
// From<init::Task>, ..., From<output::Task> for this enum.
// Additionally we have TryInto<init::Task>, (and others)
// implemented for this enum.
#[enum_dispatch(
    GetTaskName,
    WorkerHandler,
    WorkerPoolHandler,
    GetTaskArgs,
    StoreAccessVerify
)]
#[derive(Clone, Debug)]
pub enum Task {
    InitTask,
    ContextTask,
    StateTask,
    OutputTask,
}

#[enum_dispatch]
pub trait GetTaskName {
    /// Provides a human-readable name of the [`Task`], e.g. `"BehaviorExecution"`.
    fn get_task_name(&self) -> &'static str;
}

// TODO: Is there an important differentiation between Task and TaskMessage
