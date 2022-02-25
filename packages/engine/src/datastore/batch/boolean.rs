use std::sync::Arc;

use arrow::{array::Array as ArrowArray, util::bit_util};

pub struct Column {
    data: *mut u8,
}

impl Column {
    // Assumes underlying array is a non-nullable boolean array
    pub fn new_non_nullable(array: &Arc<dyn ArrowArray>) -> Column {
        let data = array.data_ref();
        let bool_buffer = &data.buffers()[0];
        Column {
            data: bool_buffer.raw_data() as *mut _,
        }
    }

    /// Change the boolean value of an element
    ///
    /// # Safety
    ///
    /// This is inherently unsafe because it does not
    /// check bounds and because it allows mutable access
    /// to other parts of memory at the same time.
    pub unsafe fn set(&mut self, index: usize, value: bool) {
        if value {
            bit_util::set_bit_raw(self.data, index);
        } else {
            unset_bit_raw(self.data, index);
        }
    }

    /// Change the boolean value of an element
    ///
    /// # Safety
    ///
    /// This is inherently unsafe because it does not
    /// check bounds.
    // TODO: unused?
    pub unsafe fn get(&mut self, index: usize) -> bool {
        bit_util::get_bit_raw(self.data, index)
    }
}

static UNSET_BIT_MASK: [u8; 8] = [254, 253, 251, 247, 239, 223, 191, 127];

unsafe fn unset_bit_raw(data: *mut u8, i: usize) {
    *data.add(i >> 3) &= UNSET_BIT_MASK[i & 7]
}

#[cfg(test)]
mod tests {
    use arrow::array::BooleanArray;
    use rand::{prelude::SliceRandom, Rng};

    use super::*;

    #[test]
    fn unset() {
        let mut rng = rand::thread_rng();
        let unset = 40;
        let size = 200;
        let mut bools = (0..size).map(|_| rng.gen_bool(0.5)).collect::<Vec<_>>();
        let boolean_array: Arc<BooleanArray> = Arc::new(bools.clone().into());
        let any_array = boolean_array as Arc<dyn ArrowArray>;
        let mut col = Column::new_non_nullable(&any_array);

        let mut indices = (0..size).collect::<Vec<_>>();
        indices.shuffle(&mut rng);
        indices[0..unset].iter().for_each(|i| {
            unsafe { col.set(*i, false) };
            bools[*i] = false;
        });

        bools
            .into_iter()
            .enumerate()
            .for_each(|(i, v)| assert_eq!(v, unsafe { col.get(i) }));
    }

    #[test]
    fn set() {
        let mut rng = rand::thread_rng();
        let size = 200;
        let mut bools = (0..size).map(|_| rng.gen_bool(0.5)).collect::<Vec<_>>();
        let boolean_array: Arc<BooleanArray> = Arc::new(bools.clone().into());
        let any_array = boolean_array as Arc<dyn ArrowArray>;
        let mut col = Column::new_non_nullable(&any_array);

        let mut indices = (0..size).collect::<Vec<_>>();
        indices.shuffle(&mut rng);
        indices.iter().for_each(|i| {
            let val = rng.gen_bool(0.5);
            unsafe { col.set(*i, val) };
            bools[*i] = val;
        });

        bools
            .into_iter()
            .enumerate()
            .for_each(|(i, v)| assert_eq!(v, unsafe { col.get(i) }));
    }
}
