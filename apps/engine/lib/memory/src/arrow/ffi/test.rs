// TODO[1] re-enable

// use std::{ffi::CStr, ffi::CString, os::raw::c_char, sync::Arc};
//
// use super::memory::CMemory;
//
// use crate::datastore::{prelude::*, schema::FieldSpecMap};
//
// use crate::datastore::schema::state::AgentSchema;
// use crate::hash_types::{state::AgentStateField, Agent};
// use rand::Rng;
// use serde::{Deserialize, Serialize};
//
// const NUM_TARGET_COLS: usize = 2;
// const TARGET_COLS: [&str; NUM_TARGET_COLS] = ["complex_struct", "other_complex_struct"];
//
// #[repr(C)]
// pub struct FlushTestChanges {
//     len: usize,
//     column_names: *const *mut c_char,
//     columns: *const *mut c_char,
// }
//
// #[repr(C)]
// pub struct FlushTestPayload {
//     memory: CMemory,
//     target_changes: FlushTestChanges,
// }
//
// #[no_mangle]
// extern "C" fn test_batch() -> *const FlushTestPayload {
//     let num_agents = 3;
//     let schema = Arc::new(test_schema().unwrap());
//     let agents = test_agents(num_agents).unwrap();
//     let droppable_batch = AgentBatch::from_agent_states(agents.as_slice(), &schema, "").unwrap();
//     // Need to create identical batch so it isn't dropped (TODO `from_agent_states_undroppable`)
//     let mut memory = Memory::shared_memory("", droppable_batch.memory.size, true, true).unwrap();
//     let src = droppable_batch.memory.get_contents_bytes().unwrap();
//     memory.overwrite_no_bounds_check(src).unwrap();
//     let ptr = memory.data.as_ptr();
//     let len = memory.size as i64;
//     let memory = Box::into_raw(Box::new(memory)) as *const Memory;
//     let c_memory = CMemory { ptr, len, memory };
//     let payload = Box::new(FlushTestPayload {
//         memory: c_memory,
//         target_changes: test_changes(num_agents),
//     });
//     Box::into_raw(payload)
// }
//
// // Does not free .memory itself as this should be an explicit call anyway
// #[no_mangle]
// unsafe extern "C" fn free_payload(payload: *mut FlushTestPayload) {
//     let payload = Box::from_raw(payload);
//     let names = payload.target_changes.column_names;
//     let cols = payload.target_changes.columns;
//     (0..payload.target_changes.len).for_each(|i| {
//         drop(CString::from_raw(*names.add(i)));
//         drop(CString::from_raw(*cols.add(i)));
//     })
// }
//
// #[no_mangle]
// unsafe extern "C" fn validate_batch(payload: *const FlushTestPayload) -> u64 {
//     let payload = &*payload;
//     let memory = &*payload.memory.memory;
//     let owned_memory = Memory::from_message(memory.get_message(), true, true).unwrap();
//
//     let batch = AgentBatch::from_memory(owned_memory, None, None).unwrap();
//     let agents = batch.batch.into_agent_states(None).unwrap();
//
//     let column1 = agents
//         .iter()
//         .map(|agent| {
//             agent
//                 .get_custom::<TestComplexStruct>(TARGET_COLS[0])
//                 .unwrap()
//         })
//         .collect::<Vec<_>>();
//
//     let column2 = agents
//         .iter()
//         .map(|agent| agent.get_custom::<TestInnerStruct>(TARGET_COLS[1]).unwrap())
//         .collect::<Vec<_>>();
//
//     let targets = payload.target_changes.columns;
//     let target_str_1 = CStr::from_ptr(*targets);
//     let target_str_2 = CStr::from_ptr(*targets.add(1));
//     let column_target_1: Vec<TestComplexStruct> =
//         serde_json::from_str(target_str_1.to_str().unwrap()).unwrap();
//     let column_target_2: Vec<TestInnerStruct> =
//         serde_json::from_str(target_str_2.to_str().unwrap()).unwrap();
//
//     if column1 == column_target_1 && column2 == column_target_2 {
//         1
//     } else {
//         0
//     }
// }
//
// fn test_agents(num: usize) -> Result<Vec<Agent>> {
//     (0..num)
//         .map(|_| {
//             let mut agent = Agent::empty();
//             agent.set(
//                 AgentStateField::AgentId.name(),
//                 uuid::Uuid::new_v4().to_hyphenated().to_string(),
//             )?;
//             agent.set("string", "agent_3_string")?;
//             agent.set("boolean", Some(false))?;
//             agent.set(TARGET_COLS[0], TestComplexStruct::default())?;
//             agent.set(
//                 "nested_number_list",
//                 vec![vec![vec![3.0_f64], vec![4.0]], vec![vec![5.0]]],
//             )?;
//             agent.set(TARGET_COLS[1], TestInnerStruct::default())?;
//             Ok(agent)
//         })
//         .collect()
// }
//
// fn test_changes(num_agents: usize) -> FlushTestChanges {
//     let column_1_name = CString::new(TARGET_COLS[0]).unwrap();
//     let column_2_name = CString::new(TARGET_COLS[1]).unwrap();
//     let column_1 = CString::new(
//         serde_json::to_string(
//             &(0..num_agents)
//                 .map(|_| TestComplexStruct::default())
//                 .collect::<Vec<_>>(),
//         )
//         .unwrap(),
//     )
//     .unwrap();
//     let column_2 = CString::new(
//         serde_json::to_string(
//             &(0..num_agents)
//                 .map(|_| TestInnerStruct::default())
//                 .collect::<Vec<_>>(),
//         )
//         .unwrap(),
//     )
//     .unwrap();
//
//     let names = vec![column_1_name.into_raw(), column_2_name.into_raw()];
//     let columns = vec![column_1.into_raw(), column_2.into_raw()];
//     let changes = FlushTestChanges {
//         len: NUM_TARGET_COLS,
//         column_names: names.as_ptr(),
//         columns: columns.as_ptr(),
//     };
//     std::mem::forget(names);
//     std::mem::forget(columns);
//     changes
// }
//
// fn test_schema() -> Result<AgentSchema> {
//     let mut field_spec_map = FieldSpecMap::default();
//     field_spec_map
//         .add_built_in(&AgentStateField::AgentId)
//         .unwrap();
//     let json = serde_json::json!({
//         "defined": {
//             "inner_struct": {
//                 "fixed_size_string_list": "[string; 2]?",
//             }
//         },
//         "keys": {
//             "string": "string?",
//             "boolean": "boolean?",
//             TARGET_COLS[0]: {
//                 "number": "number?",
//                 "fixed_size_inner_struct_list": "[inner_struct; 2]"
//             },
//             "nested_number_list": "[[[number]]]?",
//             TARGET_COLS[1]: "inner_struct"
//         }
//     });
//
//     field_spec_map.union(FieldSpecMap::from_short_json(json)?)?;
//
//     AgentSchema::from_field_spec_map(field_spec_map)
// }
//
// #[derive(Serialize, Deserialize, PartialEq, Debug)]
// struct TestInnerStruct {
//     fixed_size_string_list: [String; 2],
// }
//
// #[derive(Serialize, Deserialize, PartialEq, Debug)]
// struct TestComplexStruct {
//     number: Option<f64>,
//     fixed_size_inner_struct_list: [TestInnerStruct; 2],
// }
//
// fn rand_string() -> String {
//     let mut rng = rand::thread_rng();
//     let count = rng.gen_range(0..64);
//     let v = std::iter::repeat(())
//         .map(|()| rng.sample(rand::distributions::Alphanumeric))
//         .take(count)
//         .collect::<Vec<u8>>();
//     String::from_utf8(v).unwrap() // rand Alphanumeric gives ASCII.
// }
//
// impl Default for TestInnerStruct {
//     fn default() -> TestInnerStruct {
//         TestInnerStruct {
//             fixed_size_string_list: arr_macro::arr![rand_string(); 2],
//         }
//     }
// }
//
// impl Default for TestComplexStruct {
//     fn default() -> TestComplexStruct {
//         let mut rng = rand::thread_rng();
//         TestComplexStruct {
//             number: rng.gen(),
//             fixed_size_inner_struct_list: arr_macro::arr![TestInnerStruct::default(); 2],
//         }
//     }
// }
