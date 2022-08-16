use clap::{AppSettings::DeriveDisplayOrder, Args as _, Command, Parser};
use clap_complete::Shell;
use graph::{logging::LoggingArgs, store::DatabaseConnectionInfo};

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None, setting = DeriveDisplayOrder)]
pub struct Args {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub log_config: LoggingArgs,

    /// The host the REST client is listening at
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_API_HOST")]
    pub api_host: String,

    /// The port the REST client is listening at
    #[clap(long, default_value_t = 4000, env = "HASH_GRAPH_API_PORT")]
    pub api_port: u16,

    /// Generate a completion script for the given shell and outputs it to stdout.
    #[clap(long, arg_enum, exclusive = true)]
    generate_completion: Option<Shell>,
}

impl Args {
    /// Parse the arguments passed to the program.
    pub fn parse() -> Self {
        let args = <Args as Parser>::parse();
        if let Some(shell) = args.generate_completion {
            clap_complete::generate(
                shell,
                &mut Args::augment_args(Command::new(env!("CARGO_PKG_NAME"))),
                env!("CARGO_PKG_NAME"),
                &mut std::io::stdout(),
            );
            std::process::exit(0);
        }

        args
    }
}
