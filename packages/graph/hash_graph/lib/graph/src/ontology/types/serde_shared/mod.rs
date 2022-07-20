pub mod array;
pub mod object;
pub mod one_of;

#[cfg(test)]
pub mod tests {
    use std::fmt::Debug;

    use serde::{Deserialize, Serialize};

    /// Will serialize as a constant value `"string"`
    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub enum StringTypeTag {
        #[default]
        String,
    }

    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct StringTypeStruct {
        r#type: StringTypeTag,
    }

    pub fn check_serialization<T>(
        value: &T,
        json: &serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        T: Debug + PartialEq + Serialize,
    {
        let serialized_json = serde_json::to_value(value)?;
        assert_eq!(
            &serialized_json, json,
            "Serialized value does not match expected JSON",
        );

        Ok(())
    }

    pub fn check_deserialization<T>(
        value: &T,
        json: serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Deserialize<'de>,
    {
        let deserialized_json = serde_json::from_value::<T>(json)?;
        assert_eq!(
            &deserialized_json, value,
            "Deserialized JSON does not match expected value",
        );

        Ok(())
    }

    pub fn check<T>(value: &T, json: serde_json::Value) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Serialize + Deserialize<'de>,
    {
        check_serialization(value, &json)?;
        check_deserialization(value, json)?;
        Ok(())
    }

    pub fn check_invalid_json<T>(json: serde_json::Value)
    where
        for<'de> T: Debug + Deserialize<'de>,
    {
        serde_json::from_value::<T>(json)
            .expect_err("JSON was expected to be invalid but it was accepted");
    }
}
