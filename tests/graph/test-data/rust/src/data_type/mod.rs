use std::sync::LazyLock;

use type_system::ontology::data_type::DataType;

pub const VALUE_V1: &str = include_str!("value.json");

pub const BOOLEAN_V1: &str = include_str!("boolean.json");
pub const LIST_V1: &str = include_str!("list.json");
pub const NULL_V1: &str = include_str!("null.json");
pub const NUMBER_V1: &str = include_str!("number.json");
pub const OBJECT_V1: &str = include_str!("object_v1.json");
pub const OBJECT_V2: &str = include_str!("object_v2.json");
pub const TEXT_V1: &str = include_str!("text.json");

// Data types with inheritance
pub const LENGTH_V1: &str = include_str!("length.json");
pub const METER_V1: &str = include_str!("meter.json");
pub const CENTIMETER_V1: &str = include_str!("centimeter_v1.json");
pub const CENTIMETER_V2: &str = include_str!("centimeter_v2.json");

pub static VALUE_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(VALUE_V1).expect("should be a valid data type"));

pub static BOOLEAN_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(BOOLEAN_V1).expect("should be a valid data type"));
pub static LIST_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(LIST_V1).expect("should be a valid data type"));
pub static NULL_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(NULL_V1).expect("should be a valid data type"));
pub static NUMBER_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(NUMBER_V1).expect("should be a valid data type"));
pub static OBJECT_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(OBJECT_V1).expect("should be a valid data type"));
pub static TEXT_V1_TYPE: LazyLock<DataType> =
    LazyLock::new(|| serde_json::from_str(TEXT_V1).expect("should be a valid data type"));
