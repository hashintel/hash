use arrow2::datatypes::DataType;

pub(crate) trait IsFixedSize {
    /// Returns if the type has a non-variable size.
    ///
    /// # Panics
    ///
    /// if the requested datatype is not supported
    fn is_fixed_size(&self) -> bool;
}

impl IsFixedSize for DataType {
    fn is_fixed_size(&self) -> bool {
        match self {
            DataType::Float64 => true,
            DataType::FixedSizeBinary(_) => true,
            DataType::Utf8 => false,
            DataType::FixedSizeList(val, _) => val.data_type().is_fixed_size(),
            DataType::List(_) => false,
            _ => unimplemented!("data type {self:?} is not supported"),
        }
    }
}
