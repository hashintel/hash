use super::package::output::packages::Output;

pub struct SimulationStepOutput(pub Vec<Output>);

impl SimulationStepOutput {
    // TODO: UNUSED: Needs triage
    pub fn package_outputs(&self) -> &Vec<Output> {
        &self.0
    }

    pub fn with_capacity(capacity: usize) -> SimulationStepOutput {
        SimulationStepOutput(Vec::with_capacity(capacity))
    }

    pub fn push(&mut self, output: Output) {
        self.0.push(output);
    }
}
