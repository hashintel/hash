use crate::runner::Language;

/// Possible targets for a [`TargetedTaskMessage`] to be forwarded to by the `Worker`.
///
/// The execution chain of a `Task` is described within the docs for the
/// [`task`](crate::task) module. This enum marks all possible targets that a [`Task`] can be sent
/// to.
///
/// [`Task`]: crate::task::Task
/// [`TargetedTaskMessage`]: crate::task::TargetedTaskMessage
#[derive(Debug, Clone, Copy)]
pub enum MessageTarget {
    /// The message should be forwarded to _package.rs_ implementation and executed on the Rust
    /// Language Runner.
    Rust,
    /// The message should be forwarded to _package.py_ implementation and executed on the
    /// Python Language Runner.
    Python,
    /// The message should be forwarded to _package.js_ implementation and executed on the
    /// JavaScript Language Runner.
    JavaScript,
    /// The Package implementation is responsible for deciding the routing of the message. This is
    /// decided by passing it to the [`WorkerHandler::handle_worker_message()`] implementation of
    /// the [`Task`].
    ///
    /// [`Task`]: crate::task::Task
    /// [`WorkerHandler::handle_worker_message()`]: crate::worker::WorkerHandler::handle_worker_message
    Dynamic,
    /// The [`Task`] execution has finished, and the message is the terminating (result) message.
    ///
    /// [`Task`]: crate::task::Task
    Main,
}

impl From<Language> for MessageTarget {
    fn from(l: Language) -> Self {
        match l {
            Language::Rust => Self::Rust,
            Language::Python => Self::Python,
            Language::JavaScript | Language::TypeScript => Self::JavaScript,
        }
    }
}

impl From<flatbuffers_gen::target_generated::Target> for MessageTarget {
    fn from(target: flatbuffers_gen::target_generated::Target) -> Self {
        match target {
            flatbuffers_gen::target_generated::Target::Rust => Self::Rust,
            flatbuffers_gen::target_generated::Target::Python => Self::Python,
            flatbuffers_gen::target_generated::Target::JavaScript => Self::JavaScript,
            flatbuffers_gen::target_generated::Target::Dynamic => Self::Dynamic,
            flatbuffers_gen::target_generated::Target::Main => Self::Main,
            _ => unreachable!(),
        }
    }
}

impl From<MessageTarget> for flatbuffers_gen::target_generated::Target {
    fn from(target: MessageTarget) -> Self {
        match target {
            MessageTarget::Rust => Self::Rust,
            MessageTarget::Python => Self::Python,
            MessageTarget::JavaScript => Self::JavaScript,
            MessageTarget::Dynamic => Self::Dynamic,
            MessageTarget::Main => Self::Main,
        }
    }
}
