use clap::{Args as _, Command, Parser};
use clap_complete::Shell;
use graph::{logging::LoggingArgs, store::DatabaseConnectionInfo};
use regex::Regex;

/// Subcommand for the program.
#[derive(Debug, Clone, Default, clap::Subcommand)]
pub enum Subcommand {
    /// Run the Graph webserver.
    #[default]
    Server,
    /// Run database migrations required by the Graph.
    Migrate,
}

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub log_config: LoggingArgs,

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

    /// The OpenTelemetry protocol endpoint for sending traces.
    #[clap(long, default_value = None, env = "HASH_GRAPH_OTLP_ENDPOINT", global = true)]
    pub otlp_endpoint: Option<String>,

    /// Generate a completion script for the given shell and outputs it to stdout.
    #[clap(long, value_enum, exclusive = true)]
    generate_completion: Option<Shell>,

    // The subcommand is optional to get around the need to specify a subcommand to start the
    // server. Ideally it would use enum's default impl, but it does not.
    /// Specify whether we should run the Graph webserver or database migrations.
    #[command(subcommand)]
    pub subcommand: Option<Subcommand>,
}

impl Args {
    /// Parse the arguments passed to the program.
    pub fn parse_args() -> Self {
        let args = Self::parse();
        if let Some(shell) = args.generate_completion {
            clap_complete::generate(
                shell,
                &mut Self::augment_args(Command::new(env!("CARGO_PKG_NAME"))),
                env!("CARGO_PKG_NAME"),
                &mut std::io::stdout(),
            );
            std::process::exit(0);
        }

        args
    }

    pub fn subcommand(&self) -> Subcommand {
        self.subcommand.clone().unwrap_or_default()
    }
}
