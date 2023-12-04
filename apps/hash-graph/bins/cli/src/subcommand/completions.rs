use clap::{Args as _, Command, Parser};
use clap_complete::Shell;

use crate::args::Args;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct CompletionsArgs {
    /// The target shell syntax.
    #[clap(value_enum, exclusive = true)]
    pub shell: Shell,
}

pub fn completions(args: &CompletionsArgs) {
    clap_complete::generate(
        args.shell,
        &mut Args::augment_args(Command::new(env!("CARGO_PKG_NAME"))),
        env!("CARGO_PKG_NAME"),
        &mut std::io::stdout(),
    );
}
