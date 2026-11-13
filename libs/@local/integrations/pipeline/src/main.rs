//! Runs the checkpointed ingestion pipeline without a workflow backend.

mod command;

use std::{io::Write as _, process::ExitCode};

use clap::Parser as _;
use tokio::runtime::Builder;

use self::command::{Command, RunCommandError};

#[expect(
    clippy::use_debug,
    reason = "the command contract reports the complete error stack"
)]
fn main() -> ExitCode {
    let command = Command::parse();
    let runtime = match Builder::new_multi_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(error) => {
            let report = error_stack::Report::new(error).change_context(RunCommandError::Setup);
            let _ = writeln!(std::io::stderr().lock(), "{report:?}\nfailed: setup");
            return ExitCode::from(2);
        }
    };
    runtime.block_on(command.execute())
}
