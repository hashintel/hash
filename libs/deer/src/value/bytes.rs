use alloc::vec::Vec;

use error_stack::{Result, ResultExt};

use crate::{
    error::DeserializerError, value::IntoDeserializer, Context, Deserializer, EnumVisitor,
    OptionalVisitor, Visitor,
};

impl_deserializer!(
    #[derive(Copy)] BorrowedBytesDeserializer<'de>([u8]);
    deserialize_any!(visit_borrowed_bytes);
    deserialize_optional!();
    deserialize_enum!();
);

impl_deserializer!(
    #[derive(Copy)] BytesDeserializer<'b>([u8]);
    deserialize_any!(visit_bytes);
    deserialize_optional!();
    deserialize_enum!();
);

impl_deserializer!(
    #[derive(Clone)] BytesBufferDeserializer(Vec<u8>);
    deserialize_any!(visit_bytes_buffer);
    deserialize_optional!();
    deserialize_enum!();
);
