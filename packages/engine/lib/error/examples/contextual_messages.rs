use std::collections::HashMap;

use error::{ensure, Report, Result, ResultExt};

fn lookup_key(map: &HashMap<&str, u64>, key: &str) -> Result<u64> {
    // `ensure!` creates a `Report` if the condition fails
    ensure!(key.len() == 8, "Key must be 8 characters long");

    // A `Report` can also be created directly
    map.get(key)
        .cloned()
        .ok_or_else(|| Report::new("key does not exist"))
}

fn parse_config(config: &HashMap<&str, u64>) -> Result<u64> {
    let key = "abcd-efgh";

    // `ResultExt` provides different methods for adding additional information to the `Report`
    let value =
        lookup_key(config, key).wrap_err_lazy(|| format!("Could not lookup key {key:?}"))?;

    Ok(value)
}

fn main() -> Result<()> {
    let config = HashMap::default();
    let _config_value = parse_config(&config).wrap_err("Unable to parse config")?;

    Ok(())
}
