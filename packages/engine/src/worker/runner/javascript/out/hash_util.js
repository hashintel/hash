(arrow) => {
  "use strict";
  const json_deepcopy = (x, _depth) => {
    if (x === null || typeof x !== "object") {
      return x;
    }
    _depth = _depth || 0;
    if (_depth > 1e3) {
      throw new Error("Deepcopy recursion depth 1000 exceeded.");
    }
    if (typeof x.to_json === "function") {
      return x.to_json();
    }
    if (Array.isArray(x)) {
      const length = x.length;
      const copy2 = new Array(length);
      var i = -1;
      while (++i < length) {
        copy2[i] = json_deepcopy(x[i], _depth + 1);
      }
      return copy2;
    }
    const copy = {};
    for (var k in x) {
      if (x.hasOwnProperty(k))
        copy[k] = json_deepcopy(x[k], _depth + 1);
    }
    return copy;
  };
  const load_shallow = (vector) => {
    const shallow = [];
    for (var i = 0; i < vector.length; ++i) {
      shallow[i] = vector.get(i);
    }
    return shallow;
  };
  const _is_primitive_or_list = (children) => {
    return children.length === 1 && children[0].name === "item";
  };
  const _struct_vec_to_obj = (struct, children) => {
    if (!struct)
      return struct;
    const obj = {};
    for (var j = 0; j < children.length; ++j) {
      const child = children[j];
      const name = child.name;
      obj[name] = _vector_to_array(struct[name]);
    }
    return obj;
  };
  const _vector_to_array = (vector) => {
    if (!vector || typeof vector.toArray === "undefined") {
      return vector;
    }
    const shallow = load_shallow(vector);
    const deep = [];
    if (vector.constructor?.name === "StructRow") {
      const obj = {};
      for (const [name, val] of vector) {
        obj[name] = _vector_to_array(val);
      }
      return obj;
    } else {
      const children = vector.type.children;
      if (!children)
        return shallow;
      if (_is_primitive_or_list(children)) {
        for (var i = 0; i < shallow.length; ++i) {
          deep[i] = _vector_to_array(shallow[i]);
        }
      } else {
        for (var i = 0; i < shallow.length; ++i) {
          deep[i] = _struct_vec_to_obj(shallow[i], children);
        }
      }
    }
    return deep;
  };
  const load_full = (vector) => {
    if (vector.type.is_any) {
      const json_strs = vector.toArray();
      const array = [];
      for (var j = 0; j < json_strs.length; ++j) {
        array[j] = JSON.parse(json_strs[j]);
      }
      return array;
    }
    return _vector_to_array(vector);
  };
  const load_elem = (elem, type) => {
    if (type.is_any) {
      return JSON.parse(elem);
    }
    const children = type.children;
    if (!children)
      return elem;
    if (_is_primitive_or_list(children))
      return _vector_to_array(elem);
    return _struct_vec_to_obj(elem, children);
  };
  const uuid_to_bytes = (uuid) => {
    let v;
    const bytes = new Uint8Array(16);
    bytes[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
    bytes[1] = v >>> 16 & 255;
    bytes[2] = v >>> 8 & 255;
    bytes[3] = v & 255;
    bytes[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
    bytes[5] = v & 255;
    bytes[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
    bytes[7] = v & 255;
    bytes[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
    bytes[9] = v & 255;
    bytes[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255;
    bytes[11] = v / 4294967296 & 255;
    bytes[12] = v >>> 24 & 255;
    bytes[13] = v >>> 16 & 255;
    bytes[14] = v >>> 8 & 255;
    bytes[15] = v & 255;
    return bytes;
  };
  const byte_to_hex = [];
  for (let i = 0; i < 256; ++i) {
    byte_to_hex.push((i + 256).toString(16).substr(1));
  }
  const uuid_to_str = (bytes) => {
    const uuid = (byte_to_hex[bytes[0]] + byte_to_hex[bytes[1]] + byte_to_hex[bytes[2]] + byte_to_hex[bytes[3]] + "-" + byte_to_hex[bytes[4]] + byte_to_hex[bytes[5]] + "-" + byte_to_hex[bytes[6]] + byte_to_hex[bytes[7]] + "-" + byte_to_hex[bytes[8]] + byte_to_hex[bytes[9]] + "-" + byte_to_hex[bytes[10]] + byte_to_hex[bytes[11]] + byte_to_hex[bytes[12]] + byte_to_hex[bytes[13]] + byte_to_hex[bytes[14]] + byte_to_hex[bytes[15]]).toLowerCase();
    return uuid;
  };
  return {
    json_deepcopy,
    load_shallow,
    load_full,
    load_elem,
    uuid_to_str
  };
};
