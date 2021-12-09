use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use super::super::*;

#[test]
fn option() {
    let mv8 = MiniV8::new();

    let none_val = None::<()>.to_value(&mv8).unwrap();
    assert!(none_val.is_null());
    let num_val = Some(123).to_value(&mv8).unwrap();
    assert!(num_val.is_number());

    let none: Option<()> = FromValue::from_value(none_val.clone(), &mv8).unwrap();
    assert_eq!(none, None::<()>);
    let none: Option<()> = FromValue::from_value(Value::Null, &mv8).unwrap();
    assert_eq!(none, None::<()>);
    let none: Option<()> = FromValue::from_value(Value::Undefined, &mv8).unwrap();
    assert_eq!(none, None::<()>);
    let some_num: Option<usize> = FromValue::from_value(num_val.clone(), &mv8).unwrap();
    assert_eq!(some_num, Some(123));
    let num: usize = FromValue::from_value(num_val.clone(), &mv8).unwrap();
    assert_eq!(num, 123);
    let num_zero: usize = FromValue::from_value(none_val.clone(), &mv8).unwrap();
    assert_eq!(num_zero, 0);
}

#[test]
fn variadic() {
    let mv8 = MiniV8::new();
    let values = (true, false, true).to_values(&mv8).unwrap();

    let var: Variadic<bool> = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!(*var, vec![true, false, true]);

    let values = (true, Variadic::from_vec(vec![false, true]))
        .to_values(&mv8)
        .unwrap();
    let var: Variadic<bool> = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!(*var, vec![true, false, true]);
}

#[test]
fn tuple() {
    let mv8 = MiniV8::new();
    let values = (true, false, true).to_values(&mv8).unwrap();

    let out: (bool, bool, bool) = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!((true, false, true), out);

    let out: (bool, bool) = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!((true, false), out);

    type Overflow<'a> = (bool, bool, bool, Value<'a>, Value<'a>);
    let (a, b, c, d, e): Overflow = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!((true, false, true), (a, b, c));
    assert!(d.is_undefined());
    assert!(e.is_undefined());

    type VariadicTuple = (bool, Variadic<bool>);
    let (a, var): VariadicTuple = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!(true, a);
    assert_eq!(*var, vec![false, true]);

    type VariadicOver = (bool, bool, bool, bool, Variadic<bool>);
    let (a, b, c, d, var): VariadicOver = FromValues::from_values(values.clone(), &mv8).unwrap();
    assert_eq!((true, false, true, false), (a, b, c, d));
    assert_eq!(*var, vec![] as Vec<bool>);
}

#[test]
fn hash_map() {
    let mut map = HashMap::new();
    map.insert(1, 2);
    map.insert(3, 4);
    map.insert(5, 6);

    let mv8 = MiniV8::new();
    let list = map
        .to_value(&mv8)
        .unwrap()
        .into::<Object>(&mv8)
        .unwrap()
        .properties(false)
        .unwrap()
        .map(|p| {
            let result: (usize, usize) = p.unwrap();
            result
        })
        .collect::<Vec<_>>();
    assert_eq!(list, vec![(1, 2), (3, 4), (5, 6)]);
}

#[test]
fn btree_map() {
    let mut map = BTreeMap::new();
    map.insert(1, 2);
    map.insert(3, 4);
    map.insert(5, 6);

    let mv8 = MiniV8::new();
    let list = map
        .to_value(&mv8)
        .unwrap()
        .into::<Object>(&mv8)
        .unwrap()
        .properties(false)
        .unwrap()
        .map(|p| {
            let result: (usize, usize) = p.unwrap();
            result
        })
        .collect::<Vec<_>>();
    assert_eq!(list, vec![(1, 2), (3, 4), (5, 6)]);
}

#[test]
fn vec() {
    let vec = vec![1, 2, 3];
    let mv8 = MiniV8::new();
    let list: Result<Vec<usize>> = vec
        .to_value(&mv8)
        .unwrap()
        .into::<Array>(&mv8)
        .unwrap()
        .elements()
        .collect();
    assert_eq!(list.unwrap(), vec![1, 2, 3]);
}

#[test]
fn btree_set() {
    let btree_set: BTreeSet<_> = vec![1, 2, 3].into_iter().collect();
    let mv8 = MiniV8::new();
    let list: Result<BTreeSet<usize>> = btree_set
        .to_value(&mv8)
        .unwrap()
        .into::<Array>(&mv8)
        .unwrap()
        .elements()
        .collect();
    assert_eq!(list.unwrap(), vec![1, 2, 3].into_iter().collect());
}

#[test]
fn hash_set() {
    let hash_set: HashSet<_> = vec![1, 2, 3].into_iter().collect();
    let mv8 = MiniV8::new();
    let list: Result<HashSet<usize>> = hash_set
        .to_value(&mv8)
        .unwrap()
        .into::<Array>(&mv8)
        .unwrap()
        .elements()
        .collect();
    assert_eq!(list.unwrap(), vec![1, 2, 3].into_iter().collect());
}
