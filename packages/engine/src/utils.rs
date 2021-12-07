use std::{env::VarError, time::Duration};

pub fn init_logger() {
    if cfg!(debug_assertions) && std::env::var("RUST_LOG").is_err() {
        std::env::set_var(
            "RUST_LOG",
            "hash_cloud=debug,hash_engine=debug,cli=debug,server=debug,proto=debug,nano=debug,apiclient=debug",
        );
    }
    pretty_env_logger::init();
}

pub fn parse_env_duration(name: &str, default: u64) -> Duration {
    Duration::from_secs(
        std::env::var(name)
            .and_then(|timeout| {
                timeout.parse().map_err(|e| {
                    log::error!("Could not parse `{}` as integral: {}", name, e);
                    VarError::NotPresent
                })
            })
            .unwrap_or_else(|_| {
                log::info!("Setting `{}={}`", name, default);
                default
            }),
    )
}
