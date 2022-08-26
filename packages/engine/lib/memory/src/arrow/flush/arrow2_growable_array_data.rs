//! Contains an implementation of [`GrowableArrayData`] for [`arrow2::array::Array`].
//!
//! For more details see the documentation of [`GrowableArrayData`].

use arrow2::{
    self,
    array::{
        Array, BinaryArray, BooleanArray, FixedSizeBinaryArray, FixedSizeListArray, ListArray,
        PrimitiveArray, StructArray, Utf8Array,
    },
    datatypes::{PhysicalType, PrimitiveType},
};
use bytemuck::cast_slice;

use super::GrowableArrayData;

impl GrowableArrayData for Box<dyn Array> {
    fn len(&self) -> usize {
        Array::len(self.as_ref())
    }

    fn null_count(&self) -> usize {
        Array::null_count(self.as_ref())
    }

    fn null_buffer(&self) -> std::option::Option<&[u8]> {
        Array::validity(self.as_ref()).map(|bitmap| {
            let (slice, ..) = bitmap.as_slice();
            slice
        })
    }

    // see the trait definition for documentation on this method
    fn buffer(&self, index: usize) -> &[u8] {
        match self.data_type().to_physical_type() {
            arrow2::datatypes::PhysicalType::Null => &[],
            // boolean arrays only have a "values" field - i.e. one buffer
            arrow2::datatypes::PhysicalType::Boolean => {
                debug_assert_eq!(index, 0);

                let bool_array = self.as_any().downcast_ref::<BooleanArray>().unwrap();
                bool_array.values().as_slice().0
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Int8) => {
                debug_assert_eq!(index, 0);

                let int_8_array = self.as_any().downcast_ref::<PrimitiveArray<i8>>().unwrap();
                cast_slice(int_8_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Int16) => {
                debug_assert_eq!(index, 0);

                let int_16_array = self.as_any().downcast_ref::<PrimitiveArray<i16>>().unwrap();
                cast_slice(int_16_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Int32) => {
                debug_assert_eq!(index, 0);

                let int_32_array = self.as_any().downcast_ref::<PrimitiveArray<i32>>().unwrap();
                cast_slice(int_32_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Int64) => {
                debug_assert_eq!(index, 0);

                let int_64_array = self.as_any().downcast_ref::<PrimitiveArray<i64>>().unwrap();
                cast_slice(int_64_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Int128) => {
                debug_assert_eq!(index, 0);

                let int_64_array = self
                    .as_any()
                    .downcast_ref::<PrimitiveArray<i128>>()
                    .unwrap();
                cast_slice(int_64_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::UInt8) => {
                debug_assert_eq!(index, 0);

                let uint_8_array = self.as_any().downcast_ref::<PrimitiveArray<u8>>().unwrap();
                cast_slice(uint_8_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::UInt16) => {
                debug_assert_eq!(index, 0);

                let uint_16_array = self.as_any().downcast_ref::<PrimitiveArray<u16>>().unwrap();
                cast_slice(uint_16_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::UInt32) => {
                debug_assert_eq!(index, 0);

                let uint_32_array = self.as_any().downcast_ref::<PrimitiveArray<u32>>().unwrap();
                cast_slice(uint_32_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::UInt64) => {
                debug_assert_eq!(index, 0);

                let uint_64_array = self.as_any().downcast_ref::<PrimitiveArray<u64>>().unwrap();
                cast_slice(uint_64_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Float32) => {
                debug_assert_eq!(index, 0);

                let float_32_array = self.as_any().downcast_ref::<PrimitiveArray<f32>>().unwrap();
                cast_slice(float_32_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(PrimitiveType::Float64) => {
                debug_assert_eq!(index, 0);

                let float_64_array = self.as_any().downcast_ref::<PrimitiveArray<f64>>().unwrap();
                cast_slice(float_64_array.values().as_slice())
            }
            arrow2::datatypes::PhysicalType::Primitive(
                PrimitiveType::DaysMs | PrimitiveType::MonthDayNano,
            ) => {
                todo!("the dayms and monthdaynano array types have not yet been implemented")
            }
            arrow2::datatypes::PhysicalType::Binary if index == 0 => {
                let binary = self.as_any().downcast_ref::<BinaryArray<i32>>().unwrap();
                cast_slice(binary.offsets().as_slice())
            }
            arrow2::datatypes::PhysicalType::Binary if index == 1 => {
                let binary = self.as_any().downcast_ref::<BinaryArray<i32>>().unwrap();
                binary.values().as_slice()
            }
            arrow2::datatypes::PhysicalType::FixedSizeBinary => {
                debug_assert_eq!(index, 0);

                let fixed_size_binary = self
                    .as_any()
                    .downcast_ref::<FixedSizeBinaryArray>()
                    .unwrap();
                fixed_size_binary.values().as_slice()
            }
            arrow2::datatypes::PhysicalType::LargeBinary => {
                debug_assert_eq!(index, 0);

                let large_binary = self.as_any().downcast_ref::<BinaryArray<i64>>().unwrap();
                large_binary.values().as_slice()
            }
            arrow2::datatypes::PhysicalType::Utf8 => {
                debug_assert!(
                    index <= 1,
                    "utf8 arrays have only two buffers; a offsets buffer (index 0) and a values \
                     buffer (index 1), however, the caller provided index `{}`, which does not \
                     exist for this kind of array",
                    index
                );

                let utf8 = self.as_any().downcast_ref::<Utf8Array<i32>>().unwrap();

                if index == 0 {
                    cast_slice(utf8.offsets().as_slice())
                } else {
                    utf8.values().as_slice()
                }
            }
            arrow2::datatypes::PhysicalType::LargeUtf8 => {
                debug_assert_eq!(index, 0);

                let utf8 = self.as_any().downcast_ref::<Utf8Array<i64>>().unwrap();
                utf8.values().as_slice()
            }
            arrow2::datatypes::PhysicalType::List if index == 0 => {
                let list = self.as_any().downcast_ref::<ListArray<i32>>().unwrap();
                cast_slice(list.offsets().as_slice())
            }
            arrow2::datatypes::PhysicalType::List => {
                // only two buffers exist for a list (the two cases were handled above)
                unreachable!()
            }
            arrow2::datatypes::PhysicalType::FixedSizeList => {
                unimplemented!()
            }
            arrow2::datatypes::PhysicalType::LargeList => todo!(),
            arrow2::datatypes::PhysicalType::Struct => unimplemented!(),
            arrow2::datatypes::PhysicalType::Union => todo!(),
            arrow2::datatypes::PhysicalType::Map => todo!(),
            arrow2::datatypes::PhysicalType::Dictionary(_) => todo!(),
            _ => {
                panic!("The provided buffer index was out of range");
            }
        }
    }

    fn non_null_buffer_count(&self) -> usize {
        match self.data_type().to_physical_type() {
            PhysicalType::Null => 0,
            PhysicalType::Boolean | PhysicalType::Primitive(_) => 1,
            PhysicalType::Binary | PhysicalType::LargeBinary => 2,
            PhysicalType::Utf8 => 2,
            PhysicalType::LargeUtf8 => 1,
            PhysicalType::LargeList => 1,
            PhysicalType::Map => 1,
            PhysicalType::FixedSizeBinary => 1,
            PhysicalType::List => 1,
            PhysicalType::FixedSizeList | PhysicalType::Struct => 0,
            PhysicalType::Union => todo!(),
            PhysicalType::Dictionary(_) => 1,
        }
    }

    fn child_data(&self) -> &[Self] {
        match self.data_type().to_physical_type() {
            PhysicalType::List => {
                let array = self.as_any().downcast_ref::<ListArray<i32>>().unwrap();
                std::slice::from_ref(array.values())
            }
            PhysicalType::FixedSizeList => {
                let array = self.as_any().downcast_ref::<FixedSizeListArray>().unwrap();
                std::slice::from_ref(array.values())
            }
            PhysicalType::Struct => {
                let array = self.as_any().downcast_ref::<StructArray>().unwrap();
                array.values()
            }

            _ => &[],
        }
    }
}
