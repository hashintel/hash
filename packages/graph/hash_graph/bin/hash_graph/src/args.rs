use clap::Parser;
use clap_complete::Shell;
use graph::{logging::LoggingArgs, store::DatabaseConnectionInfo};
use regex::Regex;

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Run the Graph webserver.
    Server(ServerArgs),
    /// Run database migrations required by the Graph.
    Migrate(MirgrateArgs),
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(CompletionsArgs),
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct ServerArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    /// The host the REST client is listening at.
    #[clap(
        long,
        default_value = "127.0.0.1",
        env = "HASH_GRAPH_API_HOST",
        global = true
    )]
    pub api_host: String,

    /// The port the REST client is listening at.
    #[clap(
        long,
        default_value_t = 4000,
        env = "HASH_GRAPH_API_PORT",
        global = true
    )]
    pub api_port: u16,

    /// A regex which *new* Type System URLs are checked against. Trying to create new Types with
    /// a domain that doesn't satisfy the pattern will error.
    ///
    /// The regex must:
    ///
    /// - be in the standard format accepted by Rust's `regex` crate.
    ///
    /// - contain a capture group named "shortname" to identify a user's shortname, e.g.
    ///   `(?P<shortname>[\w|-]+)`
    ///
    /// - contain a capture group named "kind" to identify the slug of the kind of ontology type
    ///   being hosted (data-type, property-type, entity-type, link-type), e.g.
    ///   `(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type)|(?:link-type))`
    #[clap(
        long,
        default_value_t = Regex::new(r"http://localhost:3000/@(?P<shortname>[\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type)|(?:link-type))/[\w\-_%]+/").unwrap(),
        env = "HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN",
        global = true
    )]
    pub allowed_url_domain: Regex,
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct MirgrateArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct CompletionsArgs {
    /// The target shell syntax.
    #[clap(long, value_enum, exclusive = true)]
    pub shell: Shell,
}

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    /// Specify a subcommand to run.
    #[command(subcommand)]
    pub subcommand: Subcommand,
}

impl Args {
    /// Parse the arguments passed to the program.
    pub fn parse_args() -> Self {
        Self::parse()
    }
}
