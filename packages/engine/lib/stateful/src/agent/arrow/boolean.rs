use arrow2::array::BooleanArray;
use memory::arrow::util::bit_util;

pub struct BooleanColumn {
    data: *mut u8,
}

impl BooleanColumn {
    // Assumes underlying array is a non-nullable boolean array
    pub(crate) fn new_non_nullable(array: &BooleanArray) -> Self {
        let slice = array.values().as_slice().0;

        Self {
            data: slice.as_ptr() as *mut _,
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
    use arrow2::array::BooleanArray;
    use rand::{prelude::SliceRandom, Rng};

    use super::*;

    #[test]
    #[cfg_attr(miri, ignore)]
    fn unset() {
        let mut rng = rand::thread_rng();
        let unset = 40;
        let size = 200;
        let mut bools = (0..size)
            .map(|_| Some(rng.gen_bool(0.5)))
            .collect::<Vec<Option<bool>>>();
        let boolean_array = BooleanArray::from(bools.clone());
        let any_array = boolean_array.arced();
        let boolean_array = any_array.as_any().downcast_ref::<BooleanArray>().unwrap();
        let mut col = BooleanColumn::new_non_nullable(boolean_array);

        let mut indices = (0..size).collect::<Vec<_>>();
        indices.shuffle(&mut rng);
        indices[0..unset].iter().for_each(|i| {
            unsafe { col.set(*i, false) };
            bools[*i] = Some(false);
        });

        bools
            .into_iter()
            .enumerate()
            .for_each(|(i, v)| assert_eq!(v.unwrap(), unsafe { col.get(i) }));
    }

    #[test]
    #[cfg_attr(miri, ignore)]
    fn set() {
        let mut rng = rand::thread_rng();
        let size = 200;
        let mut bools = (0..size)
            .map(|_| Some(rng.gen_bool(0.5)))
            .collect::<Vec<Option<bool>>>();
        let boolean_array: BooleanArray = BooleanArray::from(bools.clone());
        let any_array = boolean_array.arced();
        let boolean_array = any_array.as_any().downcast_ref::<BooleanArray>().unwrap();
        let mut col = BooleanColumn::new_non_nullable(boolean_array);

        let mut indices = (0..size).collect::<Vec<_>>();
        indices.shuffle(&mut rng);
        indices.iter().for_each(|i| {
            let val = rng.gen_bool(0.5);
            unsafe { col.set(*i, val) };
            bools[*i] = Some(val);
        });

        bools
            .into_iter()
            .enumerate()
            .for_each(|(i, v)| assert_eq!(v.unwrap(), unsafe { col.get(i) }));
    }
}
