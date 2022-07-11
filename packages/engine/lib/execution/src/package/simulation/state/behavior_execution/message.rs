use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
// This is an empty struct, as the runners have access to all the information through Arrow
// and the task finishes by returning to the "main" target.
pub struct ExecuteBehaviorsTaskMessage {}
