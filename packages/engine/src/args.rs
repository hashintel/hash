#[derive(argh::FromArgs)]
/// Run the engine.
pub struct Args {
    /// experiment ID
    #[argh(option)]
    pub experiment_id: String,

    /// nng URL that the orchestrator is listening on
    #[argh(option)]
    pub orchestrator_url: String,

    /// nng URL to listen on
    #[argh(option)]
    pub listen_url: String,

    /// max number of workers per simulation run (optional).
    #[argh(option)]
    pub max_workers: Option<usize>,

    /// persist data to S3
    #[argh(switch)]
    pub persist: bool,
}

pub fn args() -> Args {
    argh::from_env()
}
