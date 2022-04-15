use crate::runner::RunnerConfig;

#[derive(Debug, Clone)]
pub struct RunnerSpawnConfig {
    pub python: bool,
    pub javascript: bool,
    pub rust: bool,
}

impl Default for RunnerSpawnConfig {
    fn default() -> Self {
        Self {
            python: true,
            javascript: true,
            rust: true,
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct WorkerConfig {
    pub spawn: RunnerSpawnConfig,
    pub runner_config: RunnerConfig,
}
