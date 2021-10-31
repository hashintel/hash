pub fn init_logger() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var(
            "RUST_LOG",
            "hash_cloud=debug,prime=debug,prime_engine=debug,proto=debug,nano=debug,apiclient=debug",
        );
    }
    pretty_env_logger::init();
}
