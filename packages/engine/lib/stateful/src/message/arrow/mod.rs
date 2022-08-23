pub mod array;
pub mod column;
pub mod record_batch;

use arrow2::datatypes::{DataType, Field, Schema};
use lazy_static::lazy_static;

use crate::field::PresetFieldType;

const MESSAGE_COLUMN_NAME: &str = "messages";

lazy_static! {
    static ref SENDER_ARROW_FIELD: Field = Field::new(
        "from",
        DataType::from(PresetFieldType::Id),
        false
    );
    static ref MESSAGE_ARROW_FIELDS: Vec<Field> = vec![
        Field::new(
            "to",
            DataType::List(Box::new(Field::new("item", DataType::Utf8, true))),
            false
        ),
        Field::new("type", DataType::Utf8, false),
        Field::new("data", DataType::Utf8, true),
    ];
    static ref MESSAGE_ARROW_TYPE: DataType =
        DataType::Struct(MESSAGE_ARROW_FIELDS.clone());
    static ref MESSAGE_LIST_ARROW_FIELD: Field = Field::new(
        MESSAGE_COLUMN_NAME,
        DataType::List(Box::new(Field::new("item", MESSAGE_ARROW_TYPE.clone(), true))),
        false
    );
    // It is important to keep this order unchanged. If changed
    // then the consts above must be updated
    pub(in crate::message) static ref MESSAGE_BATCH_SCHEMA: Schema = Schema::from(vec![
        SENDER_ARROW_FIELD.clone(),
        MESSAGE_LIST_ARROW_FIELD.clone()
    ]);
}
