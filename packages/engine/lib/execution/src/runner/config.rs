#[derive(Debug, Default, Clone)]
pub struct RunnerConfig {
    pub js_runner_initial_heap_constraint: Option<usize>,
    pub js_runner_max_heap_size: Option<usize>,
}
