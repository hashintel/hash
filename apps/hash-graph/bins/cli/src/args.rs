use clap::{
    ColorChoice, CommandFactory as _, FromArgMatches as _, Parser,
    builder::{
        Styles,
        styling::{AnsiColor, Effects},
    },
};
use hash_tracing::TracingConfig;

use crate::subcommand::Subcommand;

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    #[clap(flatten)]
    pub tracing_config: TracingConfig,

    /// Specify a subcommand to run.
    #[command(subcommand)]
    pub subcommand: Subcommand,
}

impl Args {
    /// Parse the arguments passed to the program.
    pub fn parse_args() -> Self {
        let mut matches = Self::command()
            .color(ColorChoice::Auto)
            .styles(
                Styles::styled()
                    .header(AnsiColor::Green.on_default() | Effects::BOLD)
                    .usage(AnsiColor::Green.on_default() | Effects::BOLD)
                    .literal(AnsiColor::Blue.on_default() | Effects::BOLD)
                    .placeholder(AnsiColor::Cyan.on_default())
                    .error(AnsiColor::Red.on_default() | Effects::BOLD)
                    .valid(AnsiColor::Green.on_default() | Effects::BOLD)
                    .invalid(AnsiColor::Red.on_default() | Effects::BOLD),
            )
            .get_matches();
        match Self::from_arg_matches_mut(&mut matches) {
            Ok(args) => args,
            Err(error) => error.format(&mut Self::command()).exit(),
        }
    }
}
