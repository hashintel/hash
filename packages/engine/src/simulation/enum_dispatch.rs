/// Enum dispatch explanation TODO
pub use enum_dispatch::enum_dispatch;

pub use crate::config::TaskDistributionConfig;
pub use crate::datastore::table::task_shared_store::TaskSharedStore;
pub use crate::simulation::{
    packages::{
        context::{ContextTask, ContextTaskMessage, ContextTaskResult},
        init::{packages::jspy::JsPyInitTaskMessage, InitTask, InitTaskMessage},
        output::{OutputTask, OutputTaskMessage, OutputTaskResult},
        state::{
            packages::behavior_execution::tasks::ExecuteBehaviorsTask, StateTask, StateTaskMessage,
            StateTaskResult,
        },
    },
    task::{
        access::StoreAccessVerify,
        args::GetTaskArgs,
        handler::{SplitConfig, WorkerHandler, WorkerPoolHandler},
        msg::{TargetedTaskMessage, TaskMessage},
        result::TaskResult,
    },
    Result, // TODO remove this and locate the source of the error
};

// pub mod prelude {
//     pub use super::super::packages::{
//         context::{ContextTask, ContextTaskMessage, ContextTaskResult},
//         init::{InitTask, InitTaskMessage, InitTaskResult},
//         output::{OutputTask, OutputTaskMessage, OutputTaskResult},
//         state::{
//             packages::behavior_execution::tasks::ExecuteBehaviorsTask, StateTask, StateTaskMessage,
//             StateTaskResult,
//         },
//     };
//
//     pub use super::{
//         access::StoreAccessVerify,
//         args::GetTaskArgs,
//         handler::{SplitConfig, WorkerHandler, WorkerPoolHandler},
//         msg::{TargetedTaskMessage, TaskMessage},
//         result::TaskResult,
//         Task,
//     };
//
//     pub use crate::config::*;
//
//     pub use crate::datastore::table::task_shared_store::TaskSharedStore;
//     pub use crate::simulation::{Error, Result};
// }
/// Explain the need for this
#[enum_dispatch]
pub trait RegisterWithoutTrait {}
