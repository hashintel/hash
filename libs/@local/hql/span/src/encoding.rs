pub(crate) mod text_range {
    use core::fmt;

    use serde::{de::Visitor, ser::SerializeMap};
    use text_size::{TextRange, TextSize};

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "serde API")]
    pub(crate) fn serialize<S>(range: &TextRange, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("start", &u32::from(range.start()))?;
        map.serialize_entry("end", &u32::from(range.end()))?;
        map.end()
    }

    struct TextRangeVisitor;

    impl<'de> Visitor<'de> for TextRangeVisitor {
        type Value = TextRange;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a span object with start and end fields")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::MapAccess<'de>,
        {
            #[derive(serde::Deserialize)]
            #[serde(field_identifier, rename_all = "lowercase")]
            enum Field {
                Start,
                End,
            }

            let mut start = None;
            let mut end = None;

            while let Some(key) = map.next_key()? {
                match key {
                    Field::Start => {
                        if start.is_some() {
                            return Err(serde::de::Error::duplicate_field("start"));
                        }
                        start = Some(map.next_value()?);
                    }
                    Field::End => {
                        if end.is_some() {
                            return Err(serde::de::Error::duplicate_field("end"));
                        }
                        end = Some(map.next_value()?);
                    }
                }
            }

            let start: u32 = start.ok_or_else(|| serde::de::Error::missing_field("start"))?;
            let end: u32 = end.ok_or_else(|| serde::de::Error::missing_field("end"))?;

            Ok(TextRange::new(TextSize::from(start), TextSize::from(end)))
        }
    }

    pub(crate) fn deserialize<'de, D>(deserializer: D) -> Result<TextRange, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_map(TextRangeVisitor)
    }
}

#[cfg(test)]
mod test {
    use text_size::{TextRange, TextSize};

    #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    struct Span(#[serde(with = "super::text_range")] TextRange);

    impl Span {
        const fn new(start: TextSize, end: TextSize) -> Self {
            Self(TextRange::new(start, end))
        }
    }

    #[test]
    fn span_serialize() {
        let span = Span::new(TextSize::from(10), TextSize::from(20));
        let json = serde_json::to_string(&span).expect("valid json");
        assert_eq!(json, r#"{"start":10,"end":20}"#);
    }

    #[test]
    fn span_deserialize() {
        let json = r#"{"start":10,"end":20}"#;
        let span: Span = serde_json::from_str(json).expect("valid json");
        assert_eq!(span, Span::new(TextSize::from(10), TextSize::from(20)));
    }

    #[test]
    fn span_deserialize_missing_key() {
        let json = r#"{"start":10}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("missing end key");
        assert!(error.to_string().starts_with("missing field `end`"));

        let json = r#"{"end":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("missing start key");
        assert!(error.to_string().starts_with("missing field `start`"));
    }

    #[test]
    fn span_deserialize_duplicate_key() {
        let json = r#"{"start":10,"start":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("duplicate start key");
        assert!(error.to_string().starts_with("duplicate field `start`"));

        let json = r#"{"end":10,"end":20}"#;
        let error = serde_json::from_str::<'_, Span>(json).expect_err("duplicate end key");
        assert!(error.to_string().starts_with("duplicate field `end`"));
    }
}
