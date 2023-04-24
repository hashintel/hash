use alloc::string::String;

use error_stack::{Result, ResultExt};

use crate::{
    error::DeserializerError, value::IntoDeserializer, Context, Deserializer, EnumVisitor,
    OptionalVisitor, Visitor,
};

impl_deserializer!(
   #[derive(Copy)] StrDeserializer<'b>(str);
    deserialize_any!(visit_str);
    deserialize_optional!();
    deserialize_enum!();
);

impl_deserializer!(
   #[derive(Copy)] BorrowedStrDeserializer<'de>(str);
    deserialize_any!(visit_borrowed_str);
    deserialize_optional!();
    deserialize_enum!();
);

impl_deserializer!(
    #[derive(Clone)] StringDeserializer(String);
    deserialize_any!(visit_string);
    deserialize_optional!();
    deserialize_enum!();
);
