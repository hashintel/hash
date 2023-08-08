"""Generate `graph_sdk.filter.path` from `graph_client.models`.

We need to generate 4 classes:

- DataTypePath
- PropertyTypePath
- EntityPath
- EntityTypePath

To generate them we have a configuration file that is located
under `graph_sdk/filter/config.json`.

The configuration file is a record with the following fields:
- `data_type`
- `property_type`
- `entity_type`
- `entity`

Each entry has the following fields:
- `selector`: Fields that require an intermediary `*` selector, and then continue
              with another type. It is a record, where the key is the field name
              and the value is the type to continue with.
              (one of `data_type`, `property_type`, `entity_type`, `entity`)
- `wildcard`: Fields that go into untyped territory through the properties selector.
- `continue`: Fields that do not require an intermediary `*` selector, and then continue
              with another type. It is a record, where the key is the field name and the
              value is the type to continue with.
              (one of `data_type`, `property_type`, `entity_type`, `entity`)

(also notice how all fields are of same length, I don't know what it is, but it always
gives me a sense of satisfaction when I see that)
"""
import ast
import json
from enum import Enum
from pathlib import Path
from typing import Literal, TypedDict

from graph_client.models import (
    DataTypeQueryToken,
    EntityQueryToken,
    EntityTypeQueryToken,
    PropertyTypeQueryToken,
)

DIRECTORY = Path(__file__).parent.parent

OntologyType = Literal["data_type", "property_type", "entity_type", "entity"]

ConfigurationEntry = TypedDict(
    "ConfigurationEntry",
    {
        "selector": dict[str, OntologyType],
        "wildcard": list[str],
        "continue": dict[str, OntologyType],
    },
)


class Configuration(TypedDict):
    """The configuration file."""

    data_type: ConfigurationEntry
    property_type: ConfigurationEntry
    entity_type: ConfigurationEntry
    entity: ConfigurationEntry


def is_keyword(name: str) -> bool:
    """Check if the given name is a keyword."""
    try:
        ast.parse(f"def {name}(): ...")
    except SyntaxError:
        return True

    return False


def get_class_name(
    name: Literal["data_type", "property_type", "entity_type", "entity"]
) -> str:
    """Get the class name for the given name."""
    return {
        "data_type": "DataTypePath",
        "property_type": "PropertyTypePath",
        "entity_type": "EntityTypePath",
        "entity": "EntityPath",
    }[name]


def load_attribute(
    path: list[str],
    ctx: ast.Load | ast.Store | None = None,
) -> ast.Attribute | ast.Name:
    """Create a dotted attribute."""
    if len(path) == 1:
        return ast.Name(id=path[0], ctx=ctx)

    return ast.Attribute(
        value=load_attribute(path[:-1], ctx=ctx),
        attr=path[-1],
        ctx=ast.Load(),
    )


def create_no_args_method(
    *,
    name: str,
    body: list[ast.stmt],
    returns: ast.expr,
) -> ast.FunctionDef:
    """Create a method with no arguments."""
    return ast.FunctionDef(
        name=name,
        args=ast.arguments(
            posonlyargs=[],
            args=[ast.arg(arg="self", annotation=None)],
            vararg=None,
            kwonlyargs=[],
            kw_defaults=[],
            kwarg=None,
            defaults=[],
        ),
        body=body,
        decorator_list=[],
        returns=returns,
    )


def generate_plain_method(
    token: Enum,
    name: str,
) -> ast.FunctionDef:
    """Generate a method that ends the path."""
    function_name = name
    while is_keyword(function_name):
        function_name += "_"

    return create_no_args_method(
        name=function_name,
        body=[
            ast.Return(
                value=ast.Call(
                    func=load_attribute(["self", "path", "push"]),
                    args=[load_attribute([type(token).name, name])],
                    keywords=[],
                )
            )
        ],
        returns=ast.Name(id="Path", ctx=ast.Load()),
    )


def generate_selector_method(
    token: Enum,
    name: str,
    next_type: OntologyType,
) -> ast.FunctionDef:
    """Generate a method that continues the path after a selector to a type."""
    next_class_name = get_class_name(next_type)

    function_name = name
    while is_keyword(function_name):
        function_name += "_"

    return create_no_args_method(
        name=function_name,
        body=[
            ast.Return(
                value=ast.Call(
                    func=ast.Attribute(
                        ast.Call(
                            value=ast.Attribute(
                                value=ast.Subscript(
                                    value=ast.Name(id="SelectorPath", ctx=ast.Load()),
                                    slice=ast.Name(id=next_class_name, ctx=ast.Load()),
                                ),
                                attr="from_path",
                                ctx=ast.Load(),
                            ),
                            args=[
                                ast.Call(
                                    func=load_attribute(["self", "path", "push"]),
                                    args=[load_attribute([type(token).name, name])],
                                    keywords=[],
                                )
                            ],
                            keywords=[],
                        ),
                        attr="set_cls",
                        ctx=ast.Load(),
                    ),
                    args=[ast.Name(value=type(token).name)],
                    keywords=[],
                )
            ),
        ],
        returns=ast.Subscript(
            value=ast.Name(id="SelectorPath", ctx=ast.Load()),
            slice=ast.Constant(value=next_class_name),
        ),
    )


def generate_wildcard_method(
    token: Enum,
    name: str,
) -> ast.FunctionDef:
    """Generate a method that continues the path with a wildcard selector."""
    function_name = name
    while is_keyword(function_name):
        function_name += "_"

    return create_no_args_method(
        name=function_name,
        body=[
            ast.Return(
                value=ast.Call(
                    func=load_attribute(["PropertiesPath", "from_path"]),
                    args=[
                        ast.Call(
                            func=load_attribute(["self", "path", "push"]),
                            args=[load_attribute([type(token).name, name])],
                            keywords=[],
                        )
                    ],
                    keywords=[],
                )
            )
        ],
        returns=ast.Name(id="PropertiesPath", ctx=ast.Load()),
    )


def generate_continue_method(
    token: Enum,
    name: str,
    next_type: OntologyType,
) -> ast.FunctionDef:
    """Generate a method that continues the path with the specified type."""
    next_class_name = get_class_name(next_type)

    function_name = name
    while is_keyword(function_name):
        function_name += "_"

    return create_no_args_method(
        name=function_name,
        body=[
            ast.Return(
                value=ast.Call(
                    func=load_attribute([next_class_name, "from_path"]),
                    args=[
                        ast.Call(
                            func=load_attribute(["self", "path", "push"]),
                            args=[load_attribute([type(token).name, name])],
                            keywords=[],
                        )
                    ],
                    keywords=[],
                )
            )
        ],
        returns=ast.Name(id=next_class_name, ctx=ast.Load()),
    )


def generate_method(
    tokens: Enum,
    method_name: str,
    *,
    selector: OntologyType | None = None,
    wildcard: bool = False,
    continue_: OntologyType | None = None,
) -> ast.FunctionDef:
    """Generate a method for a path class."""
    if selector is not None:
        return generate_selector_method(tokens, method_name, selector)

    if wildcard:
        return generate_wildcard_method(tokens, method_name)

    if continue_ is not None:
        return generate_continue_method(tokens, method_name, continue_)

    return generate_plain_method(tokens, method_name)


def generate_path(
    id_: OntologyType,
    config: ConfigurationEntry,
) -> ast.ClassDef:
    """Generate a path class."""
    class_name = get_class_name(id_)

    tokens: Enum = {
        "data_type": DataTypeQueryToken,
        "property_type": PropertyTypeQueryToken,
        "entity_type": EntityTypeQueryToken,
        "entity": EntityQueryToken,
    }[id_]

    body = [
        generate_method(
            token,
            token.name,
            selector=config["selector"].get(token.name, None),
            wildcard=token.name in config["wildcard"],
            continue_=config["continue"].get(token.name, None),
        )
        for token in tokens
    ]

    return ast.ClassDef(
        name=class_name,
        bases=[ast.Name(id="AbstractPath", ctx=ast.Load())],
        keywords=[],
        body=body,
        decorator_list=[],
    )


def imports() -> [ast.stmt]:
    """Generate the imports for the module."""
    return [
        ast.ImportFrom(
            module="typing",
            names=[
                ast.alias(name="Self", asname=None),
            ],
        ),
        ast.ImportFrom(
            module="graph_client.models",
            names=[
                ast.alias(name="DataTypeQueryToken", asname=None),
                ast.alias(name="PropertyTypeQueryToken", asname=None),
                ast.alias(name="EntityTypeQueryToken", asname=None),
                ast.alias(name="EntityQueryToken", asname=None),
            ],
        ),
        ast.ImportFrom(
            module="graph_client.filter.base",
            names=[
                ast.alias(name="AbstractPath", asname=None),
            ],
        ),
        ast.ImportFrom(
            module="graph_client.query",
            names=[
                ast.alias(name="Path", asname=None),
            ],
        ),
    ]


def doc_comment() -> ast.Expr:
    """Add a doc comment to the top of the file."""
    return ast.Expr(
        value=ast.Constant(value="This file is auto-generated. Do not edit!")
    )


configuration: Configuration = json.loads(
    (DIRECTORY / "graph_sdk" / "filter" / "config.json").read_text()
)


module = ast.Module(
    body=[
        doc_comment(),
        *imports(),
        generate_path("data_type", configuration["data_type"]),
        generate_path("property_type", configuration["property_type"]),
        generate_path("entity_type", configuration["entity_type"]),
        generate_path("entity", configuration["entity"]),
    ]
)
