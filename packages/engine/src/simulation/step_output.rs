use super::package::output::packages::Output;

pub struct SimulationStepOutput(pub Vec<Output>);

impl SimulationStepOutput {
    #[tracing::instrument(skip_all)]
    pub fn package_outputs(&self) -> &Vec<Output> {
        &self.0
    }

    #[tracing::instrument(skip_all)]
    pub fn with_capacity(capacity: usize) -> SimulationStepOutput {
        SimulationStepOutput(Vec::with_capacity(capacity))
    }

    #[tracing::instrument(skip_all)]
    pub fn push(&mut self, output: Output) {
        self.0.push(output);
    }
}
