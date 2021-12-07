pub fn init_logger() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var(
            "RUST_LOG",
            "hash_cloud=debug,hash_engine=debug,cli=debug,server=debug,proto=debug,nano=debug,apiclient=debug",
        );
    }
    pretty_env_logger::init();
}
