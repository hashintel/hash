use clap::{Args as _, Command, Parser};
use clap_complete::Shell;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// The target shell syntax.
    #[clap(value_enum, exclusive = true)]
    shell: Shell,
}

pub(super) fn run(args: &Args) {
    clap_complete::generate(
        args.shell,
        &mut crate::Args::augment_args(Command::new(env!("CARGO_PKG_NAME"))),
        env!("CARGO_PKG_NAME"),
        &mut std::io::stdout(),
    );
}
