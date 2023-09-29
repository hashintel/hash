from collections.abc import Callable
from typing import Any


def delete_key(key: str, obj: dict[str, Any]) -> None:
    del obj[key]


def flatten_all_of(key: str, obj: dict[str, Any]) -> None:
    # Merge the `allOf` without overwriting existing keys
    obj[key][0].update(obj)
    obj.update(obj[key][0])
    delete_key(key, obj)


def traverse_dict(
    obj: dict[str, Any] | list,
    func: Callable[[str, Any], bool],
    op: Callable[[str, dict[str, Any]], None],
) -> None:
    if isinstance(obj, dict):
        for key in list(obj.keys()):
            if isinstance(key, str) and func(key, obj[key]):
                op(key, obj)
            elif isinstance(obj[key], dict | list):
                traverse_dict(obj[key], func, op)
    elif isinstance(obj, list):
        for elem in obj:
            if isinstance(elem, dict | list):
                traverse_dict(elem, func, op)
