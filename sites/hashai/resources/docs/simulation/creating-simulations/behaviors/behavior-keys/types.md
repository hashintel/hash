---
title: Types
slug: simulation/creating-simulations/behaviors/behavior-keys/types
objectId: b713ff2f-2b68-4f5a-8cf3-e7a1f1d54760
---

# Types

If you've used a statically defined language before - like Rust, Go, or Clojure then you'll already be familiar with strong type systems. You select the type - `string`, `number`, `list`, etc. - of data that a field will store. This improves memory allocation and access speed, as well as making sure that if you assign an incorrect type to the field an error is thrown. **If you are unsure about typing a field, assign it an 'any' type - or ask us for help!**

## Valid Types

<!-- prettier-ignore -->
| Type | Example |
| :--- | :--- |
| Strings | "Hello" |
| Booleans | True |
| Numbers | 4.00 |
| Structs \(objects with typed fields\) | {"foo": "bar"} |
| Arrays \(ordered collections containing the same type\) | \[1,2,3\] |
| Fixed-size Arrays | \[1,2,3\] \(max 3 elements\) |
| Any | JS objects, arrays, Python objects, etc |

The `any` type designation can apply, appropriately enough, to any data type - it tells HASH to store the value as JSON and deserialize it at runtime. The generic `any` type can be used to simplify behavior key representations, but will result in slower simulation execution speeds than other type designations, so should be used sparingly.

All fields are nullable \(which means they can be assigned a null value, or may exist with no value assigned\) by default. You can turn off nullability, making a field non-nullable, which will improve simulation performance and memory utilization further. You can find the nullability setting by clicking the 3 dots.

For complex data types - lists, fixed sized lists, and structs, **you must click the tree icon** to assign the data types of members of the list or struct. You can find the setting for fixed-size list length by clicking the 3 dots.

![Click the tree icon on the right to assign the next level of data types](https://cdn-us1.hash.ai/site/docs/screen-shot-2020-11-24-at-5.36.17-pm.png)

<Hint style="info">
Dynamically populated structs should be assigned the `any` type.
</Hint>

Data type fields must be the same across behaviors. For instance if field **foo** in behavior A has type: number, field **foo** \(assuming its the same field\) in behavior B must have type: number.

<Hint style="warning">
Once you define a field's behavior key, your simulation will return an error if you attempt to assign a value of the incorrect type \(unless it is an `any` type\).
</Hint>
