use super::prelude::Result;

pub trait GetWorkerStartMsg {
    fn get_worker_start_msg(&self) -> Result<serde_json::Value>;
}

pub trait MaybeCPUBound {
    fn cpu_bound(&self) -> bool;
}
