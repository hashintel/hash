#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub python: bool,
    pub javascript: bool,
    pub rust: bool,
}

impl Default for SpawnConfig {
    fn default() -> Self {
        SpawnConfig {
            python: true,
            javascript: true,
            rust: true,
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct Config {
    pub spawn: SpawnConfig,
}
