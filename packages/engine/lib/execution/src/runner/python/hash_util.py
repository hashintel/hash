from json import loads

import pyarrow as pa
from pyarrow.types import is_primitive

from wrappers import np_force_writable


def _writable_in_place(typ):
    if is_primitive(typ):
        is_bool = typ.bit_width == 1
        return not is_bool

    if isinstance(typ, pa.FixedSizeListType):
        return _writable_in_place(typ.value_type)

    return False  # TODO: Struct? Union? FixedSizeBinary?


def load_full(
        vector, is_nullable, is_any
):  # TODO: Change arguments after upgrading pyarrow from 0.17.
    if is_any:
        # `any` type fields are expensive
        return [loads(any_obj.as_buffer().to_pybytes()) for any_obj in vector]

    if is_nullable or not _writable_in_place(vector.type):
        # NOTE: Even if some nullable field were writable in place,
        #       changing it could change the null count, so its
        #       dynamic metadata would need to be updated.
        return vector.to_pylist()

    col_np = vector.to_numpy(zero_copy_only=True)
    np_force_writable(col_np)
    return col_np

# TODO: `load_elem` like in `hash_util.js` if a use case for it comes up in a package.
