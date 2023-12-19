pub(crate) mod bytes {
    use base64::Engine;
    use bytes::Bytes;
    use serde::Deserialize;

    pub(crate) fn serialize<S>(bytes: &Bytes, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        if serializer.is_human_readable() {
            serializer.serialize_str(&base64::engine::general_purpose::STANDARD.encode(bytes))
        } else {
            serializer.serialize_bytes(bytes)
        }
    }

    pub(crate) fn deserialize<'de, D>(deserializer: D) -> Result<Bytes, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        if deserializer.is_human_readable() {
            let value = <&str>::deserialize(deserializer)?;

            let value = base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(serde::de::Error::custom)?;

            Ok(Bytes::from(value))
        } else {
            Bytes::deserialize(deserializer)
        }
    }
}
