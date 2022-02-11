//! Functionality to start and communicate with a [`hash_engine`] subprocess.

mod local;

use async_trait::async_trait;
use error::Result;
use hash_engine_lib::proto::EngineMsg;
pub use local::{LocalCommand, LocalProcess};

/// The engine-subprocess running in the background.
///
/// It's created by a [`Command`] and is used to communicate with the [`hash_engine`] library.
#[async_trait]
pub trait Process {
    /// Exits the subprocess and cleans up resources used for it.
    async fn exit_and_cleanup(self: Box<Self>) -> Result<()>;

    /// Sends a message to the underlying process
    ///
    /// # Errors
    ///
    /// Returns an error if the message could not be sent.
    async fn send(&mut self, msg: &EngineMsg) -> Result<()>;
}

/// A command for creating an engine-subprocess represented by [`Process`].
#[async_trait]
pub trait Command {
    /// Creates and runs the subprocess.
    async fn run(self: Box<Self>) -> Result<Box<dyn Process + Send>>;
}
