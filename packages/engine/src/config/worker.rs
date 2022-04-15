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
pub struct RunnerConfig {
    pub js_runner_initial_heap_constraint: Option<usize>,
    pub js_runner_max_heap_size: Option<usize>,
}

#[derive(Debug, Default, Clone)]
pub struct WorkerConfig {
    pub spawn: RunnerSpawnConfig,
    pub runner_config: RunnerConfig,
}
