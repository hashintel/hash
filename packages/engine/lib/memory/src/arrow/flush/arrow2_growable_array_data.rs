//! Contains an implementation of [`GrowableArrayData`] for [`arrow2::array::Array`].
//!
//! For more details see the documentation of [`GrowableArrayData`].

use arrow2::{
    self,
    array::{
        Array, ArrayRef, BinaryArray, BooleanArray, FixedSizeBinaryArray, FixedSizeListArray,
        ListArray, PrimitiveArray, StructArray, Utf8Array,
    },
    datatypes::{PhysicalType, PrimitiveType},
};
use bytemuck::cast_slice;

use super::GrowableArrayData;

impl GrowableArrayData for ArrayRef {
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

#[cfg(test)]
mod arrow2_matches_arrow {
    use std::sync::Arc;

    use arrow::array::{Array, BooleanBuilder, Int32Builder};

    use crate::arrow::flush::GrowableArrayData;

    /// Tests that the underlying buffers returned by [`GrowableArrayData`] are the same for
    /// arrow-rs and arrow2 types.
    fn test_equal(arrow2: Arc<dyn arrow2::array::Array>, arrow: Arc<dyn arrow::array::Array>) {
        let arrow = arrow.data();

        inner_equal_test(arrow2, arrow);
    }

    fn inner_equal_test(arrow2: Arc<dyn arrow2::array::Array>, arrow: &arrow::array::ArrayData) {
        assert_eq!(arrow2.null_count(), arrow.null_count());
        assert_eq!(
            arrow2.null_buffer(),
            <arrow::array::ArrayData as GrowableArrayData>::null_buffer(arrow)
        );
        assert_eq!(
            arrow2.non_null_buffer_count(),
            arrow.non_null_buffer_count()
        );
        for i in 0..arrow2.non_null_buffer_count() {
            assert_eq!(arrow2.buffer(i), arrow.buffer(i));
        }
        let arrow2_child_data = arrow2.child_data();
        let arrow_child_data = GrowableArrayData::child_data(arrow);
        for (arrow2, arrow) in arrow2_child_data.iter().zip(arrow_child_data.iter()) {
            inner_equal_test(arrow2.clone(), arrow);
        }
    }

    #[test]
    fn primitive_array() {
        let data = vec![Some(1), None, Some(2), Some(4), Some(1), None];

        let arrow2 = arrow2::array::Int32Array::from(data.clone()).arced();

        let mut arrow = arrow::array::Int32Builder::new(arrow2.len());
        for each in data {
            match each {
                Some(t) => {
                    arrow.append_value(t).unwrap();
                }
                None => {
                    arrow.append_null().unwrap();
                }
            }
        }
        let arrow = Arc::new(arrow.finish()) as arrow::array::ArrayRef;

        test_equal(arrow2, arrow);
    }

    #[test]
    /// This test is important, because its structure is similar to that of the
    /// MessageArray (which stores the messages to different agents).
    fn identical_list_array_of_struct_arrays_match() {
        let first_struct_column_data = vec![Some(12); 12];
        let second_struct_column_data = vec![Some(true); first_struct_column_data.len()];

        let mut first_struct_column: arrow2::array::MutablePrimitiveArray<i32> = Default::default();
        first_struct_column.extend(first_struct_column_data.clone());
        let first_struct_column: arrow2::array::PrimitiveArray<i32> = first_struct_column.into();

        let mut second_struct_column: arrow2::array::MutableBooleanArray = Default::default();
        second_struct_column.extend(second_struct_column_data.clone());
        let second_struct_column: arrow2::array::BooleanArray = second_struct_column.into();

        let arrow2 = arrow2::array::StructArray::new(
            arrow2::datatypes::DataType::Struct(vec![
                arrow2::datatypes::Field::new("f1", arrow2::datatypes::DataType::Int32, true),
                arrow2::datatypes::Field::new("f2", arrow2::datatypes::DataType::Boolean, true),
            ]),
            vec![first_struct_column.arced(), second_struct_column.arced()],
            None,
        );

        let arrow_fields = vec![
            arrow::datatypes::Field::new("f1", arrow::datatypes::DataType::Int32, true),
            arrow::datatypes::Field::new("f2", arrow::datatypes::DataType::Boolean, true),
        ];

        let mut first_struct_column = Int32Builder::new(first_struct_column_data.len());

        for item in first_struct_column_data.clone() {
            match item {
                Some(t) => {
                    first_struct_column.append_value(t).unwrap();
                }
                None => {
                    first_struct_column.append_null().unwrap();
                }
            }
        }

        let first_struct_column = first_struct_column.finish();
        let first_struct_column = Arc::new(first_struct_column);

        let mut second_struct_column = BooleanBuilder::new(first_struct_column_data.len());

        for item in second_struct_column_data {
            match item {
                Some(val) => second_struct_column.append_value(val).unwrap(),
                None => second_struct_column.append_null().unwrap(),
            }
        }

        let second_struct_column = second_struct_column.finish();
        let second_struct_column = Arc::new(second_struct_column);

        let arrow = arrow::array::StructArray::from(
            arrow_fields
                .into_iter()
                .zip(vec![
                    first_struct_column as arrow::array::ArrayRef,
                    second_struct_column as arrow::array::ArrayRef,
                ])
                .collect::<Vec<_>>(),
        );

        test_equal(arrow2.arced(), Arc::new(arrow) as arrow::array::ArrayRef)
    }
}
