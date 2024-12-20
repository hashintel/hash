#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::string::String;

use error_stack::{Report, ResultExt as _};

use crate::{
    Context, Deserializer, EnumVisitor, IdentifierVisitor, OptionalVisitor, Reflection as _,
    StructVisitor, Visitor,
    error::{DeserializerError, ExpectedType, ReceivedType, TypeError, Variant as _},
    value::IntoDeserializer,
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
