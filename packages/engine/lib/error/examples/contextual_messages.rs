use std::collections::HashMap;

use error::{ensure, Report, Result, ResultExt};

fn lookup_key(map: &HashMap<&str, u64>, key: &str) -> Result<u64> {
    // `ensure!` returns `Err(Report)` if the condition fails
    ensure!(key.len() == 8, "Key must be 8 characters long");

    // A `Report` can also be created directly
    map.get(key)
        .cloned()
        .ok_or_else(|| Report::from_message("key does not exist"))
}

fn parse_config(config: &HashMap<&str, u64>) -> Result<u64> {
    let key = "abcd-efgh";

    // `ResultExt` provides different methods for adding additional information to the `Report`
    let value =
        lookup_key(config, key).add_message_lazy(|| format!("Could not lookup key {key:?}"))?;

    Ok(value)
}

fn main() -> Result<()> {
    let config = HashMap::default();
    let _config_value = parse_config(&config).add_message("Unable to parse config")?;

    Ok(())
}
