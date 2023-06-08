use std::{
    any::Any,
    collections::{HashMap, HashSet},
    fs,
    sync::Arc,
};

use arrow2::datatypes::Schema;
use parking_lot::{RwLock, RwLockWriteGuard};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

use super::{
    super::comms::{
        inbound::{InboundToRunnerMsg, InboundToRunnerMsgPayload},
        outbound::{OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, RunnerError},
        ExperimentInitRunnerMsg, MessageTarget, NewSimulationRun, RunnerTaskMsg, StateInterimSync,
        TargetedRunnerTaskMsg,
    },
    behaviors::{get_built_in, get_built_in_columns, is_built_in},
    AgentContext, AgentState, Column, Error, GroupContext, GroupState, Result,
};
use crate::{
    config::Globals,
    datastore::{
        arrow::{
            message::{outbound_messages_to_arrow_column, MESSAGE_COLUMN_INDEX},
            util::arrow_continuation,
        },
        batch::{change::ArrayChange, ContextBatch, Metaversion},
        prelude::{AgentBatch, MessageBatch},
        storage::memory::Memory,
        table::sync::{ContextBatchSync, StateSync},
    },
    simulation::packages::{
        id::PackageId, state::packages::behavior_execution::config::BehaviorDescription,
        worker_init::PackageInitMsgForWorker,
    },
    worker::{Error as WorkerError, Result as WorkerResult, TaskMessage},
    Language,
};

struct Behavior {
    language: Language,
    function:
        Option<Box<dyn Fn(&mut AgentState, &AgentContext) -> Result<()> + Send + Sync + 'static>>,
}

pub type BehaviorID = u32;

pub struct BehaviorPackage {
    id: PackageId,
    behavior_map: HashMap<BehaviorID, Behavior>,
    behavior_col_names: HashMap<BehaviorID, Vec<String>>,

    // TODO: Make these private once there are Rust packages other than behavior execution:
    pub col_map: Arc<HashMap<String, Box<dyn Column>>>,
    pub all_behavior_col_names: Arc<HashSet<String>>,
}

impl BehaviorPackage {
    pub fn id(&self) -> PackageId {
        self.id
    }

    pub fn start_experiment(pkg_id: PackageId, init: PackageInitMsgForWorker) -> Result<Self> {
        let descs: Vec<BehaviorDescription> = serde_json::value::from_value(init.payload).unwrap();
        let mut behavior_map = HashMap::new();
        let mut col_map = HashMap::new();
        let mut behavior_col_names = HashMap::new();
        let mut all_behavior_col_names = HashSet::new();
        for desc in descs {
            if desc.language != Language::Rust {
                let behavior = Behavior {
                    language: desc.language,
                    function: None,
                };
                // Behavior IDs must be unique.
                behavior_map
                    .try_insert(desc.id, behavior)
                    .expect("Duplicate behavior id");
                continue;
            }

            if !is_built_in(&desc.name) {
                return Err(Error::InvalidRustBuiltIn(desc.name.clone()));
            }

            let behavior = Behavior {
                language: desc.language,
                function: Some(get_built_in(&desc.name)?),
            };
            behavior_map
                .try_insert(desc.id, behavior)
                .expect("Duplicate behavior id");

            let cols = get_built_in_columns(&desc.name)?;
            let mut col_names = vec![];
            for (col_name, col) in cols {
                col_names.push(col_name.clone());

                all_behavior_col_names.insert(col_name.clone());
                col_map.entry(col_name).or_insert(col);
            }
            behavior_col_names.insert(desc.id, col_names);
        }

        // Engine built-ins; TODO: Reduce code duplication
        all_behavior_col_names.insert("behaviors".to_string());
        all_behavior_col_names.insert("position".to_string());
        all_behavior_col_names.insert("direction".to_string());

        Ok(Self {
            id: pkg_id,
            behavior_map,
            behavior_col_names,
            col_map: Arc::new(col_map),
            all_behavior_col_names: Arc::new(all_behavior_col_names),
        })
    }

    pub fn run_task(
        &mut self,
        group_state: &mut GroupState,
        group_context: &GroupContext,
    ) -> Result<MessageTarget> {
        if group_state.n_agents() == 0 {
            return Ok(MessageTarget::Main);
        }

        let mut next_target = MessageTarget::Main;

        let mut agent_state = group_state.get_agent(0);
        let mut agent_context = group_context.get_agent(0);
        for i_agent in 0..group_state.n_agents() {
            agent_state.set_index(i_agent);
            agent_context.set_index(i_agent);

            let i_unexecuted = agent_state.__i_behavior()?[0];
            let behavior_ids = &agent_state.__behaviors()?[0];
            for i_behavior in i_unexecuted..behavior_ids.len() {
                agent_state.__i_behavior_set(vec![i_behavior]);
                let behavior_id = behavior_ids[i_behavior];

                let behavior = self
                    .behavior_map
                    .get(&behavior_id)
                    .ok_or_else(|| Error::InvalidBehavior(behavior_id))?;
                if behavior.language != Language::Rust {
                    next_target = MessageTarget::from(behavior.language);
                    break;
                }

                behavior.function(&mut agent_state, &agent_context)?;
                // TODO: Postprocess direction, position and messages' `to` field.
            }
        }
        Ok(next_target)
    }
}
