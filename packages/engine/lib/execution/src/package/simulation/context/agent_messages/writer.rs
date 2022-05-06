use memory::arrow::meta::{
    util::DataSliceUtils, ColumnDynamicMetadata, ColumnDynamicMetadataBuilder,
};
use stateful::context::ContextColumnWriter;

use crate::package::simulation::context::agent_messages::collected::Messages;

const NUM_NODES: usize = 3;
const NUM_BUFFERS: usize = 5;

impl ContextColumnWriter for Messages {
    fn dynamic_metadata(&self) -> stateful::Result<ColumnDynamicMetadata> {
        let mut builder = ColumnDynamicMetadataBuilder::with_capacities(NUM_NODES, NUM_BUFFERS);
        // TODO: Implement and use `builder.add_offset_buffer` convenience function;
        //       maybe also `builder.add_null_buffer`.

        let num_agents = self.indices.len();
        builder.add_node(num_agents, 0); // List of message locations
        builder.add_static_bit_buffer(num_agents); // Null buffer for List of locations
        builder.add_static_byte_buffer((num_agents + 1) * 4); // Offsets for List of locations

        // Message location, i.e. list of indices for single message
        let total_messages = self.total_count;
        builder.add_node(total_messages, 0);
        builder.add_static_bit_buffer(total_messages); // Null buffer for location

        let total_number_indices = total_messages * super::MESSAGE_INDEX_COUNT;
        builder.add_node(total_number_indices, 0); // Index
        builder.add_static_bit_buffer(total_number_indices); // Null buffer for index
        builder
            .add_static_byte_buffer(total_number_indices * std::mem::size_of::<super::IndexType>());
        Ok(builder.finish())
    }

    fn write(&self, mut data: &mut [u8], meta: &ColumnDynamicMetadata) -> stateful::Result<()> {
        tracing::debug!("Writing context message locs");
        // TODO[6](optimization)
        // we can leave these null buffers out (length = 0) if Rust does not need to read them.

        // TODO: Convenience functions for accessing/indexing buffers in `ColumnDynamicMetadata`?
        //       (Probably would have to store the buffers differently in the first place.)
        // Null buffer
        data.from_offset(&meta.buffers[0]).fill_with_ones();
        // Offsets
        // `iter` yields the number of incoming messages an agent has for each agent.
        let iter = self.indices.iter().map(|i| i.num_messages());
        data.from_offset(&meta.buffers[1])
            .write_i32_offsets_from_iter(iter);

        // Null buffer
        data.from_offset(&meta.buffers[2]).fill_with_ones();
        // Index null buffer
        data.from_offset(&meta.buffers[3]).fill_with_ones();
        // Data
        let data_buffer = unsafe {
            let aligned = data
                .from_offset(&meta.buffers[4])
                .align_to_mut::<super::IndexType>();
            // In fact, `data` was already aligned, so the prefix `aligned.0` is empty.
            debug_assert_eq!(aligned.0.len(), 0);
            aligned.1
        };

        // Write actual data in buffer
        let mut cur_index = 0;
        self.indices.iter().for_each(|v| {
            v.iter().for_each(|u| {
                data_buffer[cur_index] = u.batch_index as u32;
                data_buffer[cur_index + 1] = u.agent_index as u32;
                data_buffer[cur_index + 2] = u.message_index as u32;
                cur_index += 3;
            })
        });
        Ok(())
    }
}
