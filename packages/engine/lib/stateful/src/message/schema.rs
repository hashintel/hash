use std::sync::Arc;

use arrow::datatypes::{DataType, Field, Schema};
use lazy_static::lazy_static;
use memory::arrow::meta::{self, conversion::HashStaticMeta};

use crate::field::PresetFieldType;

pub const MESSAGE_COLUMN_NAME: &str = "messages";

lazy_static! {
    pub static ref SENDER_ARROW_FIELD: Field = Field::new(
        "from",
        DataType::from(PresetFieldType::Id),
        false
    );
    pub static ref MESSAGE_ARROW_FIELDS: Vec<Field> = vec![
        Field::new(
            "to",
            DataType::List(Box::new(Field::new("item", DataType::Utf8, true))),
            false
        ),
        Field::new("type", DataType::Utf8, false),
        Field::new("data", DataType::Utf8, true),
    ];
    pub static ref MESSAGE_ARROW_TYPE: DataType =
        DataType::Struct(MESSAGE_ARROW_FIELDS.clone());
    pub static ref MESSAGE_LIST_ARROW_FIELD: Field = Field::new(
        MESSAGE_COLUMN_NAME,
        DataType::List(Box::new(Field::new("item", MESSAGE_ARROW_TYPE.clone(), true))),
        false
    );
    // It is important to keep this order unchanged. If changed
    // then the consts above must be updated
    pub static ref MESSAGE_BATCH_SCHEMA: Schema = Schema::new(vec![
        SENDER_ARROW_FIELD.clone(),
        MESSAGE_LIST_ARROW_FIELD.clone()
    ]);
}

pub struct MessageSchema {
    pub arrow: Arc<Schema>,
    pub static_meta: Arc<meta::Static>,
}

impl Default for MessageSchema {
    fn default() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(arrow.get_static_metadata());

        Self { arrow, static_meta }
    }
}

impl MessageSchema {
    pub fn new() -> Self {
        Self::default()
    }
}
