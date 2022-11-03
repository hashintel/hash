use std::sync::Arc;

use arrow2::{
    array::{self, Array},
    buffer::MutableBuffer,
    datatypes::DataType,
    util::bit_util,
};
use serde::Deserialize;
use thiserror::Error as ThisError;

use super::{arrow_util, error::SimulationError, Error, NativeColumn, Result};
use crate::{
    datastore::{arrow::batch_conversion::new_zero_bits, batch::change::ArrayChange, POSITION_DIM},
    hash_types::Vec3,
    worker::runner::rust::{
        neighbor::Neighbor,
        state::{AgentState, GroupState},
        Column,
    },
};

pub fn vec3arr_to_arrow(arr: &Vec<Vec3>) -> Result<Arc<array::ArrayData>> {
    let mut flat_positions: Vec<f64> = Vec::with_capacity(arr.len() * 3);

    for vector in arr.iter() {
        flat_positions.push(vector.0);
        flat_positions.push(vector.1);
        flat_positions.push(vector.2);
    }
    let child_array: array::Float64Array = flat_positions.into();

    let dt = DataType::FixedSizeList(Box::new(DataType::Float64), 3);
    Ok(array::ArrayDataBuilder::new(dt)
        .len(arr.len())
        .null_count(0)
        .child_data(vec![child_array.data()])
        .build())
}

pub trait Accessors: Sized {
    fn load_elem(data_ref: &Arc<array::ArrayData>, _name: &'static str, i: usize) -> Result<Self>;
    fn load(data_ref: &Arc<array::ArrayData>, name: &'static str) -> Result<Vec<Self>>;
    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>>;
}

// TODO: Reduce code duplication with RawAccessors,
//       `impl Accessors for T where T: RawAccessors + !Option<U>`,
//       `impl Accessors for Option<T> where T: RawAccessors`

impl Accessors for Option<f64> {
    fn load_elem(data_ref: &Arc<array::ArrayData>, _name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            Ok(Some(unsafe {
                data_ref.buffers()[0].typed_data::<f64>()[i]
            }))
        } else {
            Ok(None)
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, _name: &'static str) -> Result<Vec<Option<f64>>> {
        let nulls = data_ref.null_bitmap();
        let data = &data_ref.buffers()[0];
        let floats = unsafe { data.typed_data::<f64>() };
        let mut ret = Vec::with_capacity(data_ref.len());
        if let Some(nulls) = nulls {
            floats.iter().enumerate().for_each(|(i, v)| {
                if nulls.is_set(i) {
                    ret.push(Some(*v));
                } else {
                    ret.push(None);
                }
            })
        } else {
            floats.iter().for_each(|v| {
                ret.push(Some(*v));
            })
        }
        Ok(ret)
    }

    fn as_change(col: &NativeColumn<Option<f64>>) -> Result<Option<ArrayChange>> {
        let mut builder = array::Float64Builder::new(col.data.len());
        for elem in &col.data {
            if let Some(v) = elem {
                builder.append_value(*v)?;
            } else {
                builder.append_null()?;
            }
        }
        let change = builder.finish();
        return Ok(Some(ArrayChange::new(change.data(), col.index)));
    }
}

impl Accessors for f64 {
    fn load_elem(data_ref: &Arc<array::ArrayData>, name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            Ok(unsafe { data_ref.buffers()[0].typed_data::<f64>()[i] })
        } else {
            Err(
                SimulationError::from(format!("Null in non-nullable field (with name {})", name))
                    .into(),
            )
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, name: &'static str) -> Result<Vec<Self>> {
        if data_ref.null_count() > 0 {
            Err(SimulationError::from(format!(
                "Agents with have non-nullable fields (with name {}) contains nulls",
                name
            )))?;
        }
        let data = &data_ref.buffers()[0];
        let floats = unsafe { data.typed_data::<f64>() };
        Ok(floats.to_vec())
    }

    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>> {
        let array = array::Float64Array::from(col.data.clone());
        return Ok(Some(ArrayChange::new(array.data(), col.index)));
    }
}

impl Accessors for Vec3 {
    fn load_elem(data_ref: &Arc<array::ArrayData>, name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            let child_data_buffer =
                unsafe { data_ref.child_data()[0].buffers()[0].typed_data::<f64>() };
            let start_index = i * POSITION_DIM;
            // A position always have 3 values, thus it should never fail.
            let pos = child_data_buffer[start_index..start_index + POSITION_DIM]
                .try_into()
                .unwrap();
            Ok(Vec3::from(pos.as_ref()))
        } else {
            Err(
                SimulationError::from(format!("Null in non-nullable field (with name {})", name))
                    .into(),
            )
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, name: &'static str) -> Result<Vec<Self>> {
        if data_ref.null_count() > 0 {
            Err(SimulationError::from(format!(
                "Agents with have non-nullable fields (with name {}) contains nulls",
                name
            )))?;
        }

        let child_data_buffer =
            unsafe { data_ref.child_data()[0].buffers()[0].typed_data::<f64>() };

        Ok((0..data_ref.len())
            .map(move |i| {
                let start_index = i * POSITION_DIM;
                // A position always have 3 values, thus it should never fail.
                let pos = child_data_buffer[start_index..start_index + POSITION_DIM]
                    .try_into()
                    .unwrap();
                Vec3::from(pos.as_ref())
            })
            .collect())
    }

    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>> {
        let array = vec3arr_to_arrow(&col.data)?;
        return Ok(Some(ArrayChange::new(array, col.index)));
    }
}

impl Accessors for bool {
    fn load_elem(data_ref: &Arc<array::ArrayData>, name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            let bitmap = &data_ref.buffers()[0].data();
            Ok(bit_util::get_bit(bitmap, i))
        } else {
            Err(
                SimulationError::from(format!("Null in non-nullable field (with name {})", name))
                    .into(),
            )
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, name: &'static str) -> Result<Vec<Self>> {
        if data_ref.null_count() > 0 {
            return Err(SimulationError::from(format!(
                "At least one null in non-nullable field (with name {})",
                name
            )))?;
        }

        let mut data = Vec::with_capacity(data_ref.len());
        let bitmap = &data_ref.buffers()[0].data();
        (0..data_ref.len()).for_each(|i| data.push(bit_util::get_bit(bitmap, i)));
        Ok(data)
    }

    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>> {
        let data = &col.data;
        let change = arrow_util::bool_to_arrow(data);
        let index = col.index;
        Ok(Some(ArrayChange::new(change, index)))
    }
}

impl Accessors for Option<bool> {
    fn load_elem(data_ref: &Arc<array::ArrayData>, _name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            Ok(Some(bit_util::get_bit(data_ref.buffers()[0].data(), i)))
        } else {
            Ok(None)
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, _name: &'static str) -> Result<Vec<Self>> {
        let bitmap = &data_ref.buffers()[0].data();
        let nulls = data_ref.null_buffer();
        let mut data = Vec::with_capacity(data_ref.len());
        if let Some(nulls) = nulls {
            let buf = nulls.data();
            (0..data_ref.len()).for_each(|i| {
                if bit_util::get_bit(buf, i) {
                    data.push(Some(bit_util::get_bit(bitmap, i)))
                } else {
                    data.push(None);
                }
            });
        } else {
            (0..data_ref.len()).for_each(|i| data.push(Some(bit_util::get_bit(bitmap, i))));
        }

        Ok(data)
    }

    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>> {
        let data = &col.data;
        let change = arrow_util::opt_bool_to_arrow(data);
        let index = col.index;
        Ok(Some(ArrayChange::new(change, index)))
    }
}

impl Accessors for Option<String> {
    fn load_elem(data_ref: &Arc<array::ArrayData>, _name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            let offsets = unsafe { data_ref.buffers()[0].typed_data::<i32>() };
            let data = &data_ref.buffers()[1].data();
            Ok(Some(
                String::from_utf8_lossy(&data[offsets[i]..offsets[i + 1]]).into_owned(),
            ))
        } else {
            Ok(None)
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, _name: &'static str) -> Result<Vec<Option<String>>> {
        let nulls = data_ref.null_bitmap();
        let offsets = &data_ref.buffers()[0];
        let offsets = unsafe { offsets.typed_data::<i32>() };
        let data = &data_ref.buffers()[1];
        let data = data.data();
        let mut ret = Vec::with_capacity(data_ref.len());

        let mut next_offset = offsets[0] as usize;
        for i in 0..data_ref.len() {
            let proc_offset = offsets[i + 1] as usize;
            let slice = &data[next_offset..proc_offset];
            let res = String::from_utf8_lossy(slice).into_owned();
            if let Some(nulls) = nulls {
                if nulls.is_set(i) {
                    ret.push(Some(res));
                } else {
                    ret.push(None);
                }
            } else {
                ret.push(Some(res));
            }
            next_offset = proc_offset;
        }
        Ok(ret)
    }

    fn as_change(col: &NativeColumn<Option<String>>) -> Result<Option<ArrayChange>> {
        let num_offset_bytes = std::mem::size_of::<i32>() * (col.data.len() + 1);
        let mut offsets = MutableBuffer::new(num_offset_bytes);
        offsets.resize(num_offset_bytes)?;
        let offsets_i32 = offsets.typed_data_mut::<i32>();
        let mut null_count = 0;
        let mut next_offset = 0;
        for (i, val) in col.data.iter().enumerate() {
            offsets_i32[i] = next_offset;
            if let Some(val) = val {
                let len = val.len() as i32;
                next_offset += len;
            } else {
                null_count += 1;
            }
        }

        let mut data = MutableBuffer::new(next_offset as usize);
        data.resize(next_offset as usize)?;
        let data_u8 = data.typed_data_mut::<u8>();
        let mut next_offset = 0;

        let null_buffer = if null_count > 0 {
            let mut null_bits = new_zero_bits(col.data.len());
            let mut_null_bits = null_bits.data_mut();
            for (i, val) in col.data.iter().enumerate() {
                if let Some(val) = val {
                    let len = val.len();
                    data_u8[next_offset..next_offset + len].copy_from_slice(val.as_bytes());
                    next_offset += len;
                    bit_util::set_bit(mut_null_bits, i);
                }
            }
            Some(null_bits)
        } else {
            for val in &col.data {
                let val = val.as_ref().unwrap();
                let len = val.len();
                data_u8[next_offset..next_offset + len].copy_from_slice(val.as_bytes());
                next_offset += len;
            }
            None
        };

        let mut builder = array::ArrayDataBuilder::new(DataType::Utf8)
            .len(col.data.len())
            .null_count(null_count)
            .add_buffer(offsets.freeze())
            .add_buffer(data.freeze());

        if let Some(b) = null_buffer {
            builder = builder.null_bit_buffer(b.freeze());
        }

        return Ok(Some(ArrayChange::new(builder.build(), col.index)));
    }
}

impl Accessors for Option<serde_json::Value> {
    fn load_elem(data_ref: &Arc<array::ArrayData>, _name: &'static str, i: usize) -> Result<Self> {
        if data_ref
            .null_bitmap()
            .map(|bitmap| bitmap.is_set(i))
            .unwrap_or(true)
        {
            let offsets = unsafe { data_ref.buffers()[0].typed_data::<i32>() };
            let data = &data_ref.buffers()[1].data();
            let str = String::from_utf8_lossy(&data[offsets[i]..offsets[i + 1]]);
            Ok(Some(serde_json::from_str(str.as_ref()).unwrap()))
        } else {
            Ok(None)
        }
    }

    fn load(data_ref: &Arc<array::ArrayData>, _name: &'static str) -> Result<Vec<Self>> {
        let nulls = data_ref.null_bitmap();
        let offsets = &data_ref.buffers()[0];
        let offsets = unsafe { offsets.typed_data::<i32>() };
        let data = &data_ref.buffers()[1];
        let data = data.data();
        let mut ret = Vec::with_capacity(data_ref.len());

        let mut next_offset = offsets[0] as usize;
        for i in 0..data_ref.len() {
            let proc_offset = offsets[i + 1] as usize;
            let slice = &data[next_offset..proc_offset];
            let res = std::str::from_utf8(slice)?;
            let value = serde_json::from_str(res)?;
            if let Some(nulls) = nulls {
                if nulls.is_set(i) {
                    ret.push(Some(value));
                } else {
                    ret.push(None);
                }
            } else {
                ret.push(Some(value));
            }
            next_offset = proc_offset;
        }
        Ok(ret)
    }

    fn as_change(col: &NativeColumn<Self>) -> Result<Option<ArrayChange>> {
        let string_data: Vec<Option<String>> = col
            .data
            .iter()
            .map(|opt| opt.as_ref().map(|v| serde_json::to_string(&v)).transpose())
            .collect::<serde_json::Result<_>>()?;

        let num_offset_bytes = std::mem::size_of::<i32>() * (string_data.len() + 1);
        let mut offsets = MutableBuffer::new(num_offset_bytes);
        offsets.resize(num_offset_bytes)?;
        let offsets_i32 = offsets.typed_data_mut::<i32>();
        let mut null_count = 0;
        let mut next_offset = 0;
        for (i, val) in string_data.iter().enumerate() {
            offsets_i32[i] = next_offset;
            if let Some(val) = val {
                let len = val.len() as i32;
                next_offset += len;
            } else {
                null_count += 1;
            }
        }

        let mut data = MutableBuffer::new(next_offset as usize);
        data.resize(next_offset as usize)?;
        let data_u8 = data.typed_data_mut::<u8>();
        let mut next_offset = 0;

        let null_buffer = if null_count > 0 {
            let mut null_bits = new_zero_bits(string_data.len());
            let mut_null_bits = null_bits.data_mut();
            for (i, val) in string_data.iter().enumerate() {
                if let Some(val) = val {
                    let len = val.len();
                    data_u8[next_offset..next_offset + len].copy_from_slice(val.as_bytes());
                    next_offset += len;
                    bit_util::set_bit(mut_null_bits, i);
                }
            }
            Some(null_bits)
        } else {
            for val in &string_data {
                let val = val.as_ref().unwrap();
                let len = val.len();
                data_u8[next_offset..next_offset + len].copy_from_slice(val.as_bytes());
                next_offset += len;
            }
            None
        };

        let mut builder = array::ArrayDataBuilder::new(DataType::Utf8)
            .len(col.data.len())
            .null_count(null_count)
            .add_buffer(offsets.freeze())
            .add_buffer(data.freeze());

        if let Some(b) = null_buffer {
            builder = builder.null_bit_buffer(b.freeze());
        }

        return Ok(Some(ArrayChange::new(builder.build(), col.index)));
    }
}

#[macro_export]
macro_rules! accessors {
    (
        $native_type:path,
        $column:ident,
        $base:ident,
        $base_set:ident,
        $base_mut:ident,
        $base_load:ident,
        $base_commit:ident
    ) => {
        pub fn $base(index: usize, agent_batch: &AgentBatch) -> Result<NativeColumn<$native_type>> {
            let data = Accessors::load(
                agent_batch.batch.column(index).data_ref(),
                stringify!($base),
            )?;
            Ok(NativeColumn {
                index,
                set: false,
                data,
            })
        }

        pub struct $column {}
        impl Column for $column {
            fn get<'s>(&self, state: &AgentState<'s>) -> Result<serde_json::Value> {
                // All columns in NativeState must be JSON-serializable.
                Ok(serde_json::to_value(AgentState::$base(&state)?[0]).unwrap())
            }

            fn set<'s>(&self, state: &mut AgentState<'s>, value: serde_json::Value) -> Result<()> {
                // All columns in NativeState must be JSON-deserializable.
                let native_value: $native_type = serde_json::from_value(value).unwrap();
                AgentState::$base_set(state, vec![native_value])
            }

            fn load<'s>(&self, state: &mut GroupState<'s>) -> Result<()> {
                GroupState::$base_load(state)
            }

            fn commit<'s>(&self, state: &mut GroupState<'s>) -> Result<()> {
                GroupState::$base_commit(state)
            }
        }

        /// This is a temporary wrapper to allow executing columnar behaviors on single agents.
        #[allow(dead_code)]
        impl<'s> AgentState<'s> {
            pub fn $base(&self) -> Result<&[$native_type]> {
                Ok(&self.inner.$base.u_ref()?.data[self.index_in_group..=self.index_in_group])
            }

            pub fn $base_set(&mut self, value: Vec<$native_type>) -> Result<()> {
                self.inner.$base.u_mut()?.set = true;
                self.inner.$base.u_mut()?.data[self.index_in_group] = value[0];
                Ok(())
            }

            pub fn $base_mut(&mut self) -> Result<&mut [$native_type]> {
                self.inner.$base.u_mut()?.set = true;
                Ok(&mut self.inner.$base.u_mut()?.data[self.index_in_group..=self.index_in_group])
            }
        }

        #[allow(dead_code)]
        impl<'s> GroupState<'s> {
            pub fn $base(&self) -> Result<&[$native_type]> {
                Ok(&self.inner.$base.u_ref()?.data)
            }

            pub fn $base_set(&mut self, value: Vec<$native_type>) -> Result<()> {
                self.inner.$base.u_mut()?.set = true;
                self.inner.$base.u_mut()?.data = value;
                Ok(())
            }

            pub fn $base_mut(&mut self) -> Result<&mut [$native_type]> {
                self.inner.$base.u_mut()?.set = true;
                Ok(&mut self.inner.$base.u_mut()?.data)
            }

            pub fn $base_load(&mut self) -> Result<()> {
                self.inner.$base.u_mut()?.data = Accessors::load(
                    self.data_ref(self.inner.$base.u_ref()?.index),
                    stringify!($base),
                )?;
                Ok(())
            }

            pub fn $base_commit(&mut self) -> Result<()> {
                // Do not commit if mutable actions were not done
                if self.inner.$base.u_mut()?.set {
                    if let Some(change) = Accessors::as_change(self.inner.$base.u_ref()?)? {
                        self.agent_batch.queue_change(change)?
                    }
                }
                Ok(())
            }
        }

        impl<'c> Neighbor<'c> {
            pub fn $base(&self) -> $native_type {
                // TODO: this is expensive
                let col_index = self
                    .col_indices
                    .get(stringify!($base))
                    .expect(format!("Should have `{}` column", stringify!($base)));
                let (i_group, index_in_group) = (self.loc.value(0), self.loc.value(1));
                let data_ref = self.snapshot.agent_pool[i_group]
                    .column(col_index)
                    .data_ref();
                Accessors::load_elem(data_ref, stringify!($base), index_in_group).unwrap()
            }
        }
    };
}

pub fn field_or_property<T: for<'de> Deserialize<'de> + Clone>(
    field: &Option<T>,
    property: &Option<serde_json::Value>,
    default: T,
) -> Result<T> {
    if let Some(value) = field {
        return Ok(value.clone());
    }

    if let Some(value) = property {
        return serde_json::from_value(value.clone()).map_err(Error::from);
    }

    Ok(default)
}

#[derive(ThisError, Debug)]
pub enum OptionNativeColumnExtError {
    #[error("Reference Unwrap failed on type: {0}")]
    UnwrapRefFailed(&'static str),

    #[error("Mutable Unwrap failed on type: {0}")]
    UnwrapMutFailed(&'static str),
}

pub trait OptionNativeColumnExt {
    type Value;
    fn u_ref(&self) -> Result<&Self::Value, OptionNativeColumnExtError>;
    fn u_mut(&mut self) -> Result<&mut Self::Value, OptionNativeColumnExtError>;
}

impl<T> OptionNativeColumnExt for Option<NativeColumn<T>> {
    type Value = NativeColumn<T>;

    fn u_ref(&self) -> Result<&Self::Value, OptionNativeColumnExtError> {
        self.as_ref()
            .ok_or_else(|| OptionNativeColumnExtError::UnwrapRefFailed(std::any::type_name::<T>()))
    }

    fn u_mut(&mut self) -> Result<&mut Self::Value, OptionNativeColumnExtError> {
        self.as_mut()
            .ok_or_else(|| OptionNativeColumnExtError::UnwrapMutFailed(std::any::type_name::<T>()))
    }
}
