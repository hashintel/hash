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
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs, StoreAccessVerify)]
#[derive(Clone, Debug)]
pub enum Task {
    InitTask,
    ContextTask,
    StateTask,
    OutputTask,
}

// TODO: Is there an important differentiation between Task and TaskMessage

// TODO: update these notes
// Notes:

// Each operation that a package wants to do must be declared as a Task
// which can be a custom object.
// This Task is wrapped into a PackageTask through enum_dispatch as to avoid
// the overhead of dynamic dispatch.
// A Task instance can be sent to the worker pool (WorkerPool) which is then depending on
// whether this task is a distributed or a centralized task sent to multiple workers
// or a single worker, respectively. For the distributed case, a Task can specify custom
// logic (through implementing the methods of the trait WorkerPoolHandler) on how the Task instance
// is distributed (with the base case being duplication). For the centralized case, this
// Task is passed to a worker (Worker) comprising of a triplet of language runners (Python + JS +
// Rust).
//
// For the initial message to a language runner, a method in the trait WorkerHandler (init_msg
// or similar) is called to create the first instance of the TargetedPackageTaskMsg.
// This is then sent to the respecitve target language (requires that this TargetedPackageTaskMsg)
// has all of its variants implementing conversion to/from FlatBuffers. (TODO: from fb?)
//
// A TargetedPackageTaskMsg is then returned with a possible target of Python, JavaScript, Rust,
// Custom or Main. The first three targets are obvious, so we'll touch more on Custom and on
// Main later.
// This TargetedPackageTaskMsg is passed around until a TaskResult instance is returned (which must
// be defined (by adding a custom enum-variant to TaskResult)) per each Task type.
// This TaskResult is then passed back up to the worker pool (which in the distributed case waits
// for and combines all returned 'TaskResult's into a single TaskResult (using custom logic)).
//
// 'Custom' target for TargetedPackageTaskMsg:
// Specific logic (through implementing the methods of the trait WorkerHandler) can be implemented
// to determine the logic of how received messages from a language runtime are
// reacted to. Hence if a TargetedPackageTaskMsg has a target of Custom, then "handle_worker_msg"
// from the WorkerHandler trait will be called with the respective message, which will output
// a TargetedPackageTaskMsg with a new (and different) target based on custom logic. Hence this
// target for such a message can be either Python, JavaScript, Rust or Main.
//
// 'Main' target for TargetedPackageTaskMsg:
// A message (TargetedPackageTaskMsg) of target Main indicates that our task for this Worker
// has finished either through an error or through completion. TargetedPackageTaskMsg must implement
// TryInto<TaskResult>, which will be called in the case we have a 'Main' target.
