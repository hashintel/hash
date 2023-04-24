use alloc::vec::Vec;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant},
    value::IntoDeserializer,
    Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor, Reflection, Visitor,
};

impl_deserializer!(
    #[derive(Copy)] BorrowedBytesDeserializer<'de>([u8]);
    deserialize_any!(visit_borrowed_bytes);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(visit, visit_bytes);
);

impl_deserializer!(
    #[derive(Copy)] BytesDeserializer<'b>([u8]);
    deserialize_any!(visit_bytes);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(visit, visit_bytes);
);

impl_deserializer!(
    #[derive(Clone)] BytesBufferDeserializer(Vec<u8>);
    deserialize_any!(visit_bytes_buffer);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(deref, visit_bytes);
);
