use core::error::Error;

use clap::Args as _;
use clap_complete::Shell;

use crate::{Command, Entry};

#[derive(Debug, clap::Parser)]
#[clap(version, author, about, long_about = None)]
pub struct CompletionsCommand {
    /// The target shell syntax.
    #[clap(value_enum, exclusive = true)]
    pub shell: Shell,
}

impl Command for CompletionsCommand {
    async fn execute(self) -> Result<(), Box<dyn Error>> {
        clap_complete::generate(
            self.shell,
            &mut Entry::augment_args(clap::Command::new(env!("CARGO_PKG_NAME"))),
            env!("CARGO_PKG_NAME"),
            &mut std::io::stdout(),
        );
        Ok(())
    }
}
