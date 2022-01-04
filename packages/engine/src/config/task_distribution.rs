/// Describe the distribution of a task
///
/// `single_read_access` is true when the task will only take a single read lock on each batch. In
/// the case of =true, each batch will be available to only a single worker - in the case of =false,
/// all workers will have read access to all of agent state.
#[derive(Default, Debug)]
pub struct Distribution {
    pub single_read_access: bool, // TODO: rename this, it seems misleading
}

pub enum Config {
    Distributed(Distribution),
    None,
}
