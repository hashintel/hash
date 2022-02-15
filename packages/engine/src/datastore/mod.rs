//! The `datastore` module includes logic about handling creation, modification, and access of
//! simulation data that's shared across the engine and runtimes.
//!
//! It contains the logic relating to storing data within Arrow, which allows us
//! to efficiently share large quantities of data between runtimes. It also includes the
//! functionalities we use to dynamically initialize data from schemas, and logic around data
//! access and safety.
// TODO: DOC improve wording of above, and signpost the key modules
pub mod arrow;
pub mod batch;
pub mod error;
pub mod ffi;
pub mod meta;
pub mod schema;
pub mod shared_store;
pub mod storage;
pub mod store;
pub mod table;
pub mod test_utils;

/// We store Agent IDs in the UUID-byte format (not string bytes).
/// This means their length is 128 bits i.e. 16 bytes
pub const UUID_V4_LEN: usize = 16;
pub const POSITION_DIM: usize = 3;

pub use self::error::{Error, Result};

pub mod prelude {
    pub use arrow::{
        array::Array as ArrowArray,
        buffer::{Buffer as ArrowBuffer, MutableBuffer as ArrowMutableBuffer},
        datatypes::{
            DataType as ArrowDataType, DateUnit as ArrowDateUnit, Field as ArrowField,
            IntervalUnit as ArrowIntervalUnit, Schema as ArrowSchema, TimeUnit as ArrowTimeUnit,
        },
        error::ArrowError,
        ipc as arrow_ipc,
        ipc::gen::Message::RecordBatch as RecordBatchMessage,
        record_batch::RecordBatch,
        util::bit_util as arrow_bit_util,
    };

    pub use super::{
        arrow::{
            batch_conversion::{IntoAgentStates, IntoRecordBatch},
            field_conversion,
            meta_conversion::{HashDynamicMeta, HashStaticMeta},
            padding,
        },
        batch::{
            metaversion::Metaversion,
            migration::{CopyAction, CreateAction, RemoveAction, RowActions},
            AgentBatch, AgentIndex, Batch, ContextBatch, Dataset, MessageBatch, MessageIndex,
        },
        error::{Error, Result, SupportedType},
        meta::{
            Buffer, BufferAction, Column as ColumnMeta, Dynamic as DynamicMeta, Node, NodeMapping,
            NodeStatic as NodeStaticMeta, Static as StaticMeta,
        },
        shared_store::SharedStore,
        storage::memory::Memory,
        store::Store,
        table::state::State,
    };
    pub use crate::hash_types::{message::Outbound as OutboundMessage, Agent as AgentState};
}

#[cfg(test)]
pub mod tests {
    use std::{borrow::Cow, sync::Arc};

    use rand::Rng;

    use super::{prelude::*, test_utils::gen_schema_and_test_agents};
    use crate::datastore::{
        batch::DynamicBatch, table::state::State, test_utils::dummy_sim_run_config,
    };

    #[test]
    pub fn growable_array_modification() -> Result<()> {
        pub fn modify_name(shmem_os_id: &str) -> Result<Vec<Option<String>>> {
            let mut state_batch = *AgentBatch::from_shmem_os_id(shmem_os_id)?;
            let mut column = state_batch.get_agent_name()?;
            // `targets` values will be checked against shared memory data
            // in order to check if changes were flushed properly
            let mut targets = Vec::with_capacity(column.len());
            for i in 0..column.len() {
                let mut rng = rand::thread_rng();
                if rng.gen_bool(0.1) {
                    column[i] = None;
                    targets.push(None);
                } else if rng.gen_bool(0.8) {
                    let count = rng.gen_range(0..1000);
                    let string = String::from_utf8(
                        std::iter::repeat(())
                            .map(|()| rng.sample(rand::distributions::Alphanumeric))
                            .take(count)
                            .collect::<Vec<u8>>(),
                    )?;
                    targets.push(Some(string.clone()));
                    column[i] = Some(Cow::Owned(string));
                } else {
                    match &column[i] {
                        Some(v) => targets.push(Some(v.to_string())),
                        None => targets.push(None),
                    }
                }
            }
            let change = state_batch.agent_name_as_array(column)?;
            state_batch.push_change(change)?;
            state_batch.flush_changes()?;
            Ok(targets)
        }

        let num_agents = 1000;

        let (schema, agents) = gen_schema_and_test_agents(num_agents, 0)?;

        let mut state = State::from_agent_states(&agents, Arc::new(dummy_sim_run_config()))
            .expect("Couldn't turn `Vec<Agent>` into `State`");

        // get the ID of the shared-memory segment for the first batch of agents
        let shmem_id = state
            .read()?
            .agent_pool()
            .batch(0)
            .unwrap()
            .memory
            .data
            .get_os_id()
            .to_string();

        // Run "behavior"
        let targets = modify_name(&shmem_id)?;

        let reloaded = AgentBatch::from_shmem_os_id(&shmem_id)?;
        let names = reloaded.get_agent_name()?;

        state
            .write()?
            .agent_pool_mut()
            .batch_mut(0)
            .unwrap()
            .reload()?;

        let states = state
            .read()?
            .agent_pool()
            .batch(0)
            .unwrap()
            .batch
            .into_agent_states(Some(&schema))?;
        targets.into_iter().enumerate().for_each(|(i, t)| match t {
            Some(v) => {
                assert_eq!(v, states.get(i).unwrap().agent_name.as_ref().unwrap().0);
                assert_eq!(v, names.get(i).unwrap().as_deref().unwrap());
            }
            None => {
                assert!(states[i].agent_name.is_none());
                assert!(names.get(i).unwrap().as_deref().is_none());
            }
        });

        Ok(())
    }

    #[test]
    pub fn uuid_v4_len() {
        let uuid = uuid::Uuid::new_v4();
        let bytes = uuid.as_bytes();
        assert_eq!(bytes.len(), super::UUID_V4_LEN);
    }

    #[test]
    fn test_print_boolean_array() -> Result<()> {
        let boolean_builder = arrow::array::BooleanBuilder::new(100);
        let mut fixed_size_list_builder =
            arrow::array::FixedSizeListBuilder::new(boolean_builder, 3);

        for _ in 0..10 {
            fixed_size_list_builder
                .values()
                .append_slice(&[true, false, false])?;
            fixed_size_list_builder.append(true)?;
        }

        let array = fixed_size_list_builder.finish();
        dbg!(&array.data_ref().child_data()[0].buffers()[0]);
        dbg!(&array.value(3).data_ref());
        // 0100 1001 | 1001 0010 | 0010 0100 | 0000 1001
        Ok(())
    }
}
