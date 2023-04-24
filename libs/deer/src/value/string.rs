use alloc::string::String;

use error_stack::{Result, ResultExt};

use crate::{
    error::DeserializerError,
    value::{IntoDeserializer, NoneDeserializer},
    Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor, Visitor,
};

impl_deserializer! {
   #[derive(Copy)] StrDeserializer<'b>(str);
    deserialize_any!(visit_str);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(visit, visit_str);
}

impl_deserializer! {
   #[derive(Copy)] BorrowedStrDeserializer<'de>(str);
    deserialize_any!(visit_borrowed_str);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(visit, visit_str);
}

impl_deserializer! {
    #[derive(Clone)] StringDeserializer(String);
    deserialize_any!(visit_string);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_identifier!(deref, visit_str);
}
