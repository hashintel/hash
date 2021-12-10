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

pub use error::{Error, Result};

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
        table::{context::Context, state::State},
    };
    pub use crate::hash_types::{message::Outbound as OutboundMessage, Agent as AgentState};
}

#[cfg(test)]
// TODO: OS - Unit-tests are broken, need updating for new Store read and write approach
pub mod tests {
    use super::prelude::*;
    // use super::schema::{FieldSpec, FieldSpecMap, FieldType, FieldTypeVariant};
    //
    // use rand::Rng;
    // use std::borrow::Cow;
    //
    // use crate::datastore::batch::DynamicBatch;
    // use crate::datastore::schema::{FieldScope, FieldSource, RootFieldSpec};
    // use crate::datastore::test_utils::gen_schema_and_test_agents;
    // use crate::hash_types::state::AgentStateField;
    // use std::sync::Arc;

    #[test]
    pub fn growable_array_modification() -> Result<()> {
        todo!()
        // pub fn modify_name(message: &str) -> Result<Vec<Option<String>>> {
        //     let mut sb = *AgentBatch::from_message(message)?;
        //     let mut column = sb.get_agent_name()?;
        //     // `targets` values will be checked against shared memory data
        //     // in order to check if changes were flushed properly
        //     let mut targets = Vec::with_capacity(column.len());
        //     for i in 0..column.len() {
        //         let mut rng = rand::thread_rng();
        //         if rng.gen_bool(0.1) {
        //             column[i] = None;
        //             targets.push(None);
        //         } else if rng.gen_bool(0.8) {
        //             let count = rng.gen_range(0..1000);
        //             let string = String::from_utf8(
        //                 std::iter::repeat(())
        //                     .map(|()| rng.sample(rand::distributions::Alphanumeric))
        //                     .take(count)
        //                     .collect::<Vec<u8>>(),
        //             )
        //             .unwrap();
        //             targets.push(Some(string.clone()));
        //             column[i] = Some(Cow::Owned(string));
        //         } else {
        //             match &column[i] {
        //                 Some(v) => targets.push(Some(v.to_string())),
        //                 None => targets.push(None),
        //             }
        //         }
        //     }
        //     let change = sb.agent_name_as_array(column)?;
        //     sb.push_change(change)?;
        //     sb.flush_changes()?;
        //     Ok(targets)
        // }
        //
        // let num_agents = 1000;
        //
        // let (schema, agents) = gen_schema_and_test_agents(num_agents, 0).unwrap();
        //
        // let store = Store::new(Arc::new("".into()), field_spec_map)?;
        //
        // // Create a new simulation
        // let table_ref = store.new_table(&agents)?;
        //
        // let table = table_ref.try_write().unwrap();
        // let message = table.dynamic_pool[0]
        //     .try_read()
        //     .expect("Should be able to read dynamic batch")
        //     .memory
        //     .get_message()
        //     .to_string();
        //
        // // Run "behavior"
        // let targets = modify_name(&message)?;
        //
        // let reloaded = AgentBatch::from_message(&message)?;
        // let names = reloaded.get_agent_name()?;
        //
        // table.dynamic_pool[0]
        //     .try_write()
        //     .expect("Should be able to write to dynamic batch")
        //     .reload()?;
        // let states = table.get_agent_states()?;
        // targets.into_iter().enumerate().for_each(|(i, t)| match t {
        //     Some(v) => {
        //         assert_eq!(v, states.get(i).unwrap().agent_name.as_ref().unwrap().0);
        //         assert_eq!(v, names.get(i).unwrap().as_deref().unwrap());
        //     }
        //     None => {
        //         assert!(states[i].agent_name.is_none());
        //         assert!(names.get(i).unwrap().as_deref().is_none());
        //     }
        // });
        //
        // Ok(())
    }

    #[test]
    pub fn test_behavior_metadata() -> Result<()> {
        todo!()
        // let mut keys = FieldSpecMap::default()?;
        // keys.add(FieldSpec::new_mergeable(
        //     "age",
        //     FieldType::new(FieldTypeVariant::Number, false),
        // ))?;
        // keys.add_built_in(&AgentStateField::Behaviors)?;
        // let store = Store::new(Arc::new("".into()), keys)?;
        //
        // let num_agents = 5;
        //
        // let mut agents = Vec::with_capacity(num_agents);
        //
        // let target = vec!["age.rs", "collision.rs", "diffusion.rs", "self_destroy.rs"];
        //
        // for i in 0..num_agents {
        //     let mut agent = AgentState::empty();
        //     agent.set("age", i)?;
        //     agent.set("behaviors", &target)?;
        //     agents.push(agent);
        // }
        //
        // let table_ref = store.new_table(&agents)?;
        //
        // let table = table_ref.try_write().unwrap();
        //
        // let message = table.dynamic_pool[0]
        //     .try_read()
        //     .expect("Should be able to read dynamic batch")
        //     .get_batch_message()?;
        //
        // let reloaded = AgentBatch::from_message(&message.msg)?;
        // reloaded
        //     .get_behaviors()?
        //     .iter()
        //     .enumerate()
        //     .for_each(|(i, v)| {
        //         assert_eq!(v, &target[i]);
        //     });
        //
        // Ok(())
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

    #[test]
    pub fn test_struct_types_enabled() -> Result<()> {
        todo!()
        // let mut keys = FieldSpecMap::default()?;
        // keys.add(FieldSpec::new_mergeable(
        //     "struct",
        //     FieldType::new(
        //         FieldTypeVariant::Struct(vec![
        //             FieldSpec::new_mergeable(
        //                 "first_column",
        //                 FieldType::new(FieldTypeVariant::Number, false),
        //             ),
        //             FieldSpec::new_mergeable(
        //                 "second_column",
        //                 FieldType::new(FieldTypeVariant::Boolean, true),
        //             ),
        //         ]),
        //         true,
        //     ),
        // ))?;
        //
        // keys.get_arrow_schema()?;
        // Ok(())
    }
}
