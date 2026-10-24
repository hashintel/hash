use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum Segment {
    Key(String),
    Index(usize),
}

/// A patch with the same path representation as Petrinaut's TypeScript API.
#[derive(Clone, Debug, Serialize)]
pub struct Patch {
    op: Operation,
    path: Vec<Segment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<Value>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
enum Operation {
    Add,
    Remove,
    Replace,
}

impl Patch {
    pub(crate) fn replace(path: Vec<Segment>, number: f64) -> Self {
        Self {
            op: Operation::Replace,
            path,
            value: Some(Value::from(number)),
        }
    }
}

pub(crate) fn diff(previous: &Value, next: &Value) -> Vec<Patch> {
    let mut patches = Vec::new();
    diff_at(previous, next, &mut Vec::new(), &mut patches);
    patches
}

fn diff_at(previous: &Value, next: &Value, path: &mut Vec<Segment>, patches: &mut Vec<Patch>) {
    if previous == next {
        return;
    }
    match (previous, next) {
        (Value::Object(before), Value::Object(after)) => {
            for (key, value) in before {
                path.push(Segment::Key(key.clone()));
                if let Some(new_value) = after.get(key) {
                    diff_at(value, new_value, path, patches);
                } else {
                    patches.push(Patch {
                        op: Operation::Remove,
                        path: path.clone(),
                        value: None,
                    });
                }
                path.pop();
            }
            for (key, value) in after {
                if !before.contains_key(key) {
                    path.push(Segment::Key(key.clone()));
                    patches.push(Patch {
                        op: Operation::Add,
                        path: path.clone(),
                        value: Some(value.clone()),
                    });
                    path.pop();
                }
            }
        }
        (Value::Array(before), Value::Array(after)) => {
            for (index, (old_value, new_value)) in before.iter().zip(after).enumerate() {
                path.push(Segment::Index(index));
                diff_at(old_value, new_value, path, patches);
                path.pop();
            }
            for index in (after.len()..before.len()).rev() {
                path.push(Segment::Index(index));
                patches.push(Patch {
                    op: Operation::Remove,
                    path: path.clone(),
                    value: None,
                });
                path.pop();
            }
            for (index, value) in after.iter().enumerate().skip(before.len()) {
                path.push(Segment::Index(index));
                patches.push(Patch {
                    op: Operation::Add,
                    path: path.clone(),
                    value: Some(value.clone()),
                });
                path.pop();
            }
        }
        (Value::Number(before), Value::Number(after))
            if before.is_f64() != after.is_f64()
                && before.as_f64() == after.as_f64()
                && before
                    .as_f64()
                    .is_some_and(|number| number.abs() <= 9_007_199_254_740_991.0) => {}
        _ => patches.push(Patch {
            op: Operation::Replace,
            path: path.clone(),
            value: Some(next.clone()),
        }),
    }
}

pub(crate) fn apply(document: &mut Value, patches: &[Patch]) -> Result<(), String> {
    for patch in patches {
        let Some((last, parents)) = patch.path.split_last() else {
            *document = patch
                .value
                .clone()
                .ok_or("Root replacement requires a value")?;
            continue;
        };
        let mut parent = &mut *document;
        for segment in parents {
            parent = match segment {
                Segment::Key(key) => parent.get_mut(key),
                Segment::Index(index) => parent.get_mut(index),
            }
            .ok_or("History patch parent does not exist")?;
        }
        match (parent, last) {
            (Value::Object(object), Segment::Key(key)) => {
                if matches!(patch.op, Operation::Remove) {
                    object.remove(key);
                } else {
                    object.insert(
                        key.clone(),
                        patch.value.clone().ok_or("Patch requires a value")?,
                    );
                }
            }
            (Value::Array(array), Segment::Index(index)) => match patch.op {
                Operation::Add if *index <= array.len() => {
                    array.insert(*index, patch.value.clone().ok_or("Patch requires a value")?);
                }
                Operation::Remove if *index < array.len() => {
                    array.remove(*index);
                }
                Operation::Replace if *index < array.len() => {
                    *array
                        .get_mut(*index)
                        .ok_or("History patch index is out of bounds")? =
                        patch.value.clone().ok_or("Patch requires a value")?;
                }
                Operation::Add | Operation::Remove | Operation::Replace => {
                    return Err("History patch index is out of bounds".to_owned());
                }
            },
            _ => return Err("History patch path does not match the document".to_owned()),
        }
    }
    Ok(())
}
