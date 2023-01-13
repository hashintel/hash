use std::{collections::HashMap, marker::PhantomData};

use stateful::field::UUID_V4_LEN;

pub struct ApiResponseToAnonymous {
    pub from: &'static str,
    pub r#type: &'static str,
    pub data: String,
}

/// Struct returned by a custom message handler
pub struct ApiResponseMap {
    pub from: &'static str,
    pub r#type: &'static str,
    pub map: HashMap<[u8; UUID_V4_LEN], Vec<String>>,
}

impl ApiResponseMap {
    pub fn take_for_agent(&mut self, id: &[u8; UUID_V4_LEN]) -> Vec<ApiResponseToAnonymous> {
        self.map
            .remove(id)
            .map(|v| {
                v.into_iter()
                    .map(|data| ApiResponseToAnonymous {
                        from: self.from,
                        r#type: self.r#type,
                        data,
                    })
                    .collect()
            })
            .unwrap_or_else(Vec::new)
    }
}

/// Static string column representation for API messages
pub struct SizedStaticStringColumn {
    pub data: Vec<Vec<&'static str>>,
    /// Sum of string lengths
    pub char_count: usize,
}

/// String column representation for API messages
pub struct SizedStringColumn {
    pub data: Vec<Vec<String>>,
    /// Sum of string lengths
    pub char_count: usize,
}

/// Columnar native representation of external API responses
pub struct ApiResponses<'a> {
    pub from: SizedStaticStringColumn,
    pub r#type: SizedStaticStringColumn,
    pub data: SizedStringColumn,
    /// Number of messages in total
    pub msg_count: usize,
    phantom: PhantomData<&'a ()>,
}

impl From<Vec<Vec<ApiResponseToAnonymous>>> for ApiResponses<'_> {
    fn from(v: Vec<Vec<ApiResponseToAnonymous>>) -> Self {
        // TODO: performance: into_iter to access fields at same time and avoid clones
        ApiResponses {
            from: SizedStaticStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.from).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.from.len()).sum::<usize>()
                }),
            },
            r#type: SizedStaticStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.r#type).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.r#type.len()).sum::<usize>()
                }),
            },
            data: SizedStringColumn {
                data: v
                    .iter()
                    .map(|v| v.iter().map(|v| v.data.clone()).collect())
                    .collect(),
                char_count: v.iter().fold(0, |acc, elem| {
                    acc + elem.iter().map(|e| e.data.len()).sum::<usize>()
                }),
            },
            msg_count: v.iter().fold(0, |acc, elem| acc + elem.len()),
            phantom: PhantomData,
        }
    }
}
