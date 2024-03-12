#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::string::String;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant},
    value::IntoDeserializer,
    Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor, Reflection,
    StructVisitor, Visitor,
};

impl_deserializer!(
   #[derive(Copy)] StrDeserializer<'b>(str);
    deserialize_any!(visit_str);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, str);
    deserialize_identifier!(visit, visit_str);
);

impl_deserializer!(
   #[derive(Copy)] BorrowedStrDeserializer<'de>(str);
    deserialize_any!(visit_borrowed_str);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, str);
    deserialize_identifier!(visit, visit_str);
);

impl_deserializer!(
    #[derive(Clone)] StringDeserializer(String);
    deserialize_any!(visit_string);
    deserialize_optional!();
    deserialize_enum!();
    deserialize_struct!(error, str);
    deserialize_identifier!(visit, deref, visit_str);
);
