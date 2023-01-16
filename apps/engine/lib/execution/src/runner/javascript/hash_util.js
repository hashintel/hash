// noinspection BadExpressionStatementJS

// TODO: Add this file to hash_stdlib instead?

// Only values `x` that are JSON-serializable or have a `to_json` method are supported.
// `_depth` is an optional argument.
// Throws an `Error` if recursion depth 1000 is exceeded.
export const json_deepcopy = (x, _depth) => {
  if (x === null || typeof x !== "object") {
    return x;
  }

  // TODO: Nicer circular reference handling if it's worth the performance cost.
  //       Currently we can still end up recursing endlessly if `x.to_json` is a
  //       function that (incorrectly) returns an object that contains `x`.
  //       (Incorrect already because each call to a `to_json` function should
  //       return an independent copy of the JSON-serializable object, so
  //       two copies shouldn't contain an identical reference to `x`.)
  //       (Passing `_depth` to `to_json` doesn't seem worth the annoyance for
  //       package authors, since infinite recursion due to deepcopying an
  //       object with circular references returned by a `to_json` function is
  //       probably a rare error in the first place.)
  _depth = _depth || 0;
  if (_depth > 1000) {
    throw new Error("Deepcopy recursion depth 1000 exceeded.");
  }

  if (typeof x.to_json === "function") {
    // E.g. lazy-loaded Neighbor object
    return x.to_json();
  }

  if (Array.isArray(x)) {
    // TODO: Benchmark vs `new x.constructor(length)` and vs `const copy = [];`.
    const length = x.length;
    const copy = new Array(length);

    // TODO: Benchmark vs `for (var i = -1; ++i < a.length;)` and vs `for (var i = 0; i <`
    var i = -1;
    while (++i < length) {
      copy[i] = json_deepcopy(x[i], _depth + 1);
    }
    return copy;
  }

  // TODO: Object.keys vs Object.entries vs hasOwnProperty
  const copy = {}; // TODO: array-like objects? (generally prototype of `x` is ignored)
  for (var k in x) {
    if (x.hasOwnProperty(k)) copy[k] = json_deepcopy(x[k], _depth + 1);
  }
  return copy;
};

// NB: If input is an `any`-type column, will return an array of strings (containing JSON).
// TODO: Change arguments after upgrading Arrow (is_nullable and is_any will probably become
//       unnecessary as we want to store them in column metadata).
export const load_shallow = (vector, is_nullable, is_any) => {
  // `vector.toArray` returns array-like (in some cases? TODO), not actual array.
  const shallow = [];
  for (var i = 0; i < vector.length; ++i) {
    shallow[i] = vector.get(i);
  }
  return shallow;
};

const _is_primitive_or_list = (children) => {
  // TODO: This is currently a flakey form of duck-typing, that only works because the only nested field we support
  // are structs (we do not support Union or Map types). We should be testing by the type of the object here,
  // if we move to TypeScript this will become a lot easier to do
  return children.length === 1 && children[0].name === "item";
};

const _struct_vec_to_obj = (struct, children) => {
  if (!struct) return struct; // Null in Arrow array

  const obj = {};
  for (var j = 0; j < children.length; ++j) {
    const child = children[j];
    const name = child.name;
    obj[name] = _vector_to_array(struct[name]);
  }
  return obj;
};

const _vector_to_array = (vector) => {
  // TODO: This function is called often enough that it
  //       might be worth benchmarking and micro-optimizing.
  if (!vector || typeof vector.toArray === "undefined") {
    return vector; // `vector` isn't actually a vector.
  }
  const shallow = load_shallow(vector);

  const deep = [];

  // For the inner struct types Arrow returns a `StructRow` instead of a `Vector`, it implements an iterator that
  // goes over field names and value pairs
  if (vector.constructor?.name === "StructRow") {
    const obj = {};
    for (const [name, val] of vector) {
      obj[name] = _vector_to_array(val);
    }
    return obj;
  } else {
    const children = vector.type.children;
    if (!children) return shallow;

    if (_is_primitive_or_list(children)) {
      // Primitive (strings, numbers) or list
      // `!!field.type.listSize` --> fixed-size list.
      for (var i = 0; i < shallow.length; ++i) {
        deep[i] = _vector_to_array(shallow[i]);
      }
    } else {
      // Struct array (we don't use Arrow's union arrays)
      for (var i = 0; i < shallow.length; ++i) {
        deep[i] = _struct_vec_to_obj(shallow[i], children);
      }
    }
  }
  return deep;
};

// TODO: Change arguments after upgrading Arrow (is_nullable and is_any will probably become
//       unnecessary as we want to store them in column metadata).
export const load_full = (vector, is_nullable, is_any) => {
  // TODO: Do manual zero-copy conversion for non-nullable fixed-size types.
  //       (Or modify JS Arrow `toArray` implementation.)

  if (vector.type.is_any) {
    // Can only have top-level `any`.
    const json_strs = vector.toArray(); // Shallow load
    const array = [];
    for (var j = 0; j < json_strs.length; ++j) {
      array[j] = JSON.parse(json_strs[j]);
    }
    return array;
  }
  return _vector_to_array(vector);
};

/// `elem` should be an element of a shallow-loaded array.
/// `type` should be the type corresponding to the whole array (not a single element).
/// (Loading `elem` manually for a known field type
/// will generally be somewhat faster than using `load_elem`,
/// because `load_elem` has to parse `field` at runtime.)
export const load_elem = (elem, type) => {
  if (type.is_any) {
    // Can only have top-level `any`.
    // `elem` must be a string containing JSON.
    // TODO: Double-check that nulls in any-type arrays are serialized into JSON.
    //       Otherwise would need `return elem ? JSON.parse(elem) : null`;
    return JSON.parse(elem);
  }

  const children = type.children;
  if (!children) return elem;
  if (_is_primitive_or_list(children)) return _vector_to_array(elem);
  return _struct_vec_to_obj(elem, children);
};

const uuid_to_bytes = (uuid) => {
  let v;
  const bytes = new Uint8Array(16);

  // Parse ########-....-....-....-............
  bytes[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  bytes[1] = (v >>> 16) & 0xff;
  bytes[2] = (v >>> 8) & 0xff;
  bytes[3] = v & 0xff;

  // Parse ........-####-....-....-............
  bytes[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  bytes[5] = v & 0xff;

  // Parse ........-....-####-....-............
  bytes[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  bytes[7] = v & 0xff;

  // Parse ........-....-....-####-............
  bytes[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  bytes[9] = v & 0xff;

  // Parse ........-....-....-....-############
  // (Use "/" to avoid 32-bit truncation when bit-shifting high-order bytes)
  bytes[10] = ((v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000) & 0xff;
  bytes[11] = (v / 0x100000000) & 0xff;
  bytes[12] = (v >>> 24) & 0xff;
  bytes[13] = (v >>> 16) & 0xff;
  bytes[14] = (v >>> 8) & 0xff;
  bytes[15] = v & 0xff;

  return bytes;
};

const byte_to_hex = [];
for (let i = 0; i < 256; ++i) {
  byte_to_hex.push((i + 0x100).toString(16).substr(1));
}

export const uuid_to_str = (bytes) => {
  const uuid = (
    byte_to_hex[bytes[0]] +
    byte_to_hex[bytes[1]] +
    byte_to_hex[bytes[2]] +
    byte_to_hex[bytes[3]] +
    "-" +
    byte_to_hex[bytes[4]] +
    byte_to_hex[bytes[5]] +
    "-" +
    byte_to_hex[bytes[6]] +
    byte_to_hex[bytes[7]] +
    "-" +
    byte_to_hex[bytes[8]] +
    byte_to_hex[bytes[9]] +
    "-" +
    byte_to_hex[bytes[10]] +
    byte_to_hex[bytes[11]] +
    byte_to_hex[bytes[12]] +
    byte_to_hex[bytes[13]] +
    byte_to_hex[bytes[14]] +
    byte_to_hex[bytes[15]]
  ).toLowerCase();
  return uuid;
};
