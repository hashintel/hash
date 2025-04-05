use clap::Parser as _;
use hashql_compiletest::Options;

#[derive(Debug, clap::Subcommand)]
enum Command {
    List,
    Run {
        #[clap(long, short, default_value_t = false)]
        bless: bool,
    },
}

impl From<Command> for hashql_compiletest::Command {
    fn from(value: Command) -> Self {
        match value {
            Command::List => Self::List,
            Command::Run { bless } => Self::Run { bless },
        }
    }
}

#[derive(Debug, clap::Parser)]
struct Cli {
    #[clap(long, short)]
    filter: Option<String>,

    #[clap(subcommand)]
    command: Command,
}

fn main() {
    let cli = Cli::parse();

    let options = Options {
        filter: cli.filter,
        command: cli.command.into(),
    };

    options.run();
}
