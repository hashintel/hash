use std::sync::Arc;

use arrow::{array::Array, util::bit_util};

pub struct BooleanColumn {
    data: *mut u8,
}

impl BooleanColumn {
    // Assumes underlying array is a non-nullable boolean array
    pub(in crate) fn new_non_nullable(array: &Arc<dyn Array>) -> Self {
        let data = array.data_ref();
        let bool_buffer = &data.buffers()[0];
        Self {
            data: bool_buffer.as_ptr() as *mut _,
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
            bit_util::unset_bit_raw(self.data, index);
        }
    }

    /// Change the boolean value of an element
    ///
    /// # Safety
    ///
    /// This is inherently unsafe because it does not
    /// check bounds.
    // TODO: UNUSED: Needs triage
    pub unsafe fn get(&mut self, index: usize) -> bool {
        bit_util::get_bit_raw(self.data, index)
    }
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
        let any_array = boolean_array as Arc<dyn Array>;
        let mut col = BooleanColumn::new_non_nullable(&any_array);

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
        let any_array = boolean_array as Arc<dyn Array>;
        let mut col = BooleanColumn::new_non_nullable(&any_array);

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
