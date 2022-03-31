use memory::meta::{util::DataSliceUtils, ColumnDynamicMetadata, ColumnDynamicMetadataBuilder};

use crate::{
    datastore::Result as DatastoreResult,
    simulation::package::context::{packages::neighbors::map::NeighborMap, ContextColumnWriter},
};

const NUM_NODES: usize = 3;
const NUM_BUFFERS: usize = 5;

impl ContextColumnWriter for NeighborMap {
    fn get_dynamic_metadata(&self) -> DatastoreResult<ColumnDynamicMetadata> {
        let mut builder = ColumnDynamicMetadataBuilder::with_capacities(NUM_NODES, NUM_BUFFERS);

        let num_agents = self.data.len();
        builder.add_node(num_agents, 0); // List of lists
        builder.add_static_bit_buffer(num_agents); // Null buffer for List of lists
        builder.add_static_byte_buffer((num_agents + 1) * 4); // Offsets for List of lists

        let total_neighbors = self.total_count;
        builder.add_node(total_neighbors, 0); // List of neighbor indices
        builder.add_static_bit_buffer(total_neighbors); // Null buffer for List of neighbor indices

        let total_number_indices = total_neighbors * super::NEIGHBOR_INDEX_COUNT;

        builder.add_node(total_number_indices, 0); // Neighbor indices
        builder.add_static_bit_buffer(total_number_indices); // Null buffer for Neighbor indices
        builder
            .add_static_byte_buffer(total_number_indices * std::mem::size_of::<super::IndexType>()); // Neighbor index buffer
        Ok(builder.finish())
    }

    fn write(&self, mut data: &mut [u8], meta: &ColumnDynamicMetadata) -> DatastoreResult<()> {
        // TODO[6](optimization)
        // we can leave these null buffers out (length = 0) if Rust does not need to read them.

        // Null buffer
        data.from_offset(&meta.buffers[0]).fill_with_ones();
        // Offsets
        data.from_offset(&meta.buffers[1])
            .write_i32_offsets_from_iter(self.data.iter().map(Vec::len));
        // Null buffer
        data.from_offset(&meta.buffers[2]).fill_with_ones();
        // Index null buffer
        data.from_offset(&meta.buffers[3]).fill_with_ones();
        // Data
        let data_buffer = unsafe {
            let aligned = data
                .from_offset(&meta.buffers[4])
                .align_to_mut::<super::IndexType>();
            debug_assert_eq!(aligned.0.len(), 0);
            aligned.1
        };

        // Write actual data in buffer
        let mut cur_index = 0;
        self.data.iter().for_each(|v| {
            v.iter().for_each(|u| {
                data_buffer[cur_index] = u.0;
                data_buffer[cur_index + 1] = u.1;
                cur_index += 2;
            })
        });
        Ok(())
    }
}
