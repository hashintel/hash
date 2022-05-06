use stateful::agent::Agent;

#[derive(Debug)]
pub struct JsonStateOutput {
    pub inner: Vec<Agent>,
}
