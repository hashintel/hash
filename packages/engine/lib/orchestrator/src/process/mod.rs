//! Functionality to start and communicate with a `hash_engine` subprocess.

mod local;

use std::process::ExitStatus;

use async_trait::async_trait;
use execution::package::experiment::ExperimentId;
use experiment_control::comms::EngineMsg;

pub use self::local::{LocalCommand, LocalProcess};
use crate::error::Result;

/// The engine-subprocess running in the background.
///
/// It's created by a [`Command`] and is used to communicate with the `hash_engine` library.
#[async_trait]
pub trait Process {
    /// Exits the subprocess and cleans up resources used for it.
    async fn exit_and_cleanup(self: Box<Self>, experiment_id: ExperimentId) -> Result<()>;

    /// Sends a message to the underlying process
    ///
    /// # Errors
    ///
    /// Returns an error if the message could not be sent.
    async fn send(&mut self, msg: &EngineMsg) -> Result<()>;

    /// Waits for the process to exit completely, returning the status that it exited with.
    async fn wait(&mut self) -> Result<ExitStatus>;
}

/// A command for creating an engine-subprocess represented by [`Process`].
#[async_trait]
pub trait Command {
    /// Creates and runs the subprocess.
    async fn run(self: Box<Self>) -> Result<Box<dyn Process + Send>>;
}
