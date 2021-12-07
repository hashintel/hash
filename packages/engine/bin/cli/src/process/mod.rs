mod error;

mod local;
mod process;

pub use error::{Error, Result};
pub use local::{LocalCommand, LocalProcess};
pub use process::{Command, Process};
