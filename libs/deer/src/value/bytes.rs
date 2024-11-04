#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::vec::Vec;

use error_stack::{Report, ResultExt as _};

use crate::{
    Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor, Reflection as _,
    StructVisitor, Visitor,
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant as _},
    value::IntoDeserializer,
};

impl_deserializer!(
    #[derive(Copy)] BorrowedBytesDeserializer<'de>([u8]);
    deserialize_any!(visit_borrowed_bytes);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, [u8]);
    deserialize_identifier!(visit, visit_bytes);
);

impl_deserializer!(
    #[derive(Copy)] BytesDeserializer<'b>([u8]);
    deserialize_any!(visit_bytes);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, [u8]);
    deserialize_identifier!(visit, visit_bytes);
);

impl_deserializer!(
    #[derive(Clone)] BytesBufferDeserializer(Vec<u8>);
    deserialize_any!(visit_bytes_buffer);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, [u8]);
    deserialize_identifier!(visit, deref, visit_bytes);
);
