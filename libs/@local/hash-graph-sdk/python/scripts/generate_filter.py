"""Generate `graph_sdk.filter.path` from `graph_client.models`.

We need to generate 4 classes:

- DataTypeQueryPath
- PropertyTypeQueryPath
- EntityTypeQueryPath
- EntityQueryPath

To generate them we have a configuration file that is located
under `graph_sdk/filter/config.json`.

The configuration file is a record with the following fields:
- `data_type`
- `property_type`
- `entity_type`
- `entity`

Each entry has the following fields:
- `selector`: Fields that require an intermediary selector, and then continue
              with another type. It is a record, where the key is the field name
              and the value is the type to continue with.
              (one of `data_type`, `property_type`, `entity_type`, `entity`)
- `untyped`: Fields that go into untyped territory through the properties selector.
- `direct`: Fields that do not require an intermediary selector, and then continue
              with another type. It is a record, where the key is the field name and the
              value is the type to continue with.
              (one of `data_type`, `property_type`, `entity_type`, `entity`)
- `arguments`: Fields that have (optional) arguments,
               these arguments follow as `key-value` pairs after the name of the property.
"""
# ruff: noqa: ERA001
import ast
import json
from enum import Enum
from pathlib import Path
from typing import Literal, TypedDict, assert_never

from graph_client.models import (
    DataTypeQueryToken,
    EntityQueryToken,
    EntityTypeQueryToken,
    PropertyTypeQueryToken,
)

DIRECTORY = Path(__file__).parent.parent

TypeId = Literal["data_type", "property_type", "entity_type", "entity"]


class Argument(TypedDict):
    """Type information for an argument."""

    type: Literal["uint"]
    required: bool


class Meta(TypedDict):
    """Additional configuration file information."""

    arguments: dict[str, Argument]


class ConfigurationEntry(TypedDict):
    """A configuration entry."""

    selector: dict[str, TypeId]
    untyped: list[str]
    direct: dict[str, TypeId]
    arguments: dict[str, list[str]]


class Configuration(TypedDict):
    """The configuration file."""

    meta: Meta

    data_type: ConfigurationEntry
    property_type: ConfigurationEntry
    entity_type: ConfigurationEntry
    entity: ConfigurationEntry


def is_builtin(name: str) -> bool:
    """Check if the given name is a builtin."""
    return name in dir(__builtins__)


def is_keyword(name: str) -> bool:
    """Check if the given name is a keyword."""
    try:
        ast.parse(f"def {name}(): ...")
    except SyntaxError:
        return True

    return False


def is_keyword_or_builtin(name: str) -> bool:
    """Check if the given name is a keyword or builtin."""
    return is_builtin(name) or is_keyword(name)


def to_snake_case(name: str) -> str:
    """Convert a camel case name to snake case."""
    return "".join(
        f"_{char.lower()}" if char.isupper() else char for char in name
    ).lstrip("_")


def get_class_name(
    name: Literal["data_type", "property_type", "entity_type", "entity"],
) -> str:
    """Get the class name for the given name."""
    return {
        "data_type": "DataTypeQueryPath",
        "property_type": "PropertyTypeQueryPath",
        "entity_type": "EntityTypeQueryPath",
        "entity": "EntityQueryPath",
    }[name]


def get_human_readable_name(token: Enum) -> str:
    """Get the human readable name for the given token."""
    return {
        "DataTypeQueryToken": "a data type",
        "PropertyTypeQueryToken": "a property type",
        "EntityTypeQueryToken": "an entity type",
        "EntityQueryToken": "an entity",
    }[type(token).__name__]


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


def argument_annotation(argument: Argument) -> ast.expr:
    """Generate the annotation for an argument."""
    type_ = None

    if argument["type"] == "uint":
        type_ = ast.Name(id="int", ctx=ast.Load())

    if type_ is None:
        assert_never(argument["type"])

    if not argument["required"]:
        return ast.BinOp(left=type_, op=ast.BitOr(), right=ast.Name(id="None"))

    return type_


def create_method(
    *,
    name: str,
    args: dict[str, Argument],
    body: list[ast.stmt],
    returns: ast.expr,
) -> ast.FunctionDef:
    """Create a method with arguments."""
    keywords = [
        ast.arg(arg=to_snake_case(name), annotation=argument_annotation(info))
        for name, info in args.items()
    ]

    keyword_defaults = [
        None if info["required"] else ast.Constant(value=None) for info in args.values()
    ]

    return ast.FunctionDef(
        name=name,
        args=ast.arguments(
            posonlyargs=[],
            args=[ast.arg(arg="self", annotation=None)],
            vararg=None,
            kwonlyargs=keywords,
            kw_defaults=keyword_defaults,
            kwarg=None,
            defaults=[],
        ),
        body=body,
        decorator_list=[],
        returns=returns,
    )


def generate_method_docstring(
    token: Enum,
    name: str,
) -> ast.Expr:
    """Generate a docstring for the given method."""
    return ast.Expr(
        value=ast.Constant(
            value=(
                f"Return the path to the {name} attribute "
                f"of {get_human_readable_name(token)}."
            ),
        ),
    )


def generate_method_argument_body(args: dict[str, Argument]) -> list[ast.stmt]:
    """Generate the body for the method arguments."""
    if not args:
        return []

    # we need to create additional body statements, that will compile to:
    # args = []
    # if <arg> is not None:
    #     args.append(f"{<name>}={<arg>}")
    #
    statements: list[ast.stmt] = [
        ast.Assign(
            [ast.Name(id="args", ctx=ast.Store())],
            ast.List(elts=[], ctx=ast.Load()),
        ),
    ]

    for name, info in args.items():
        variable = ast.Name(id=to_snake_case(name), ctx=ast.Load())

        append_value = ast.JoinedStr(
            values=[
                ast.Constant(value=f"{name}="),
                ast.FormattedValue(value=variable, conversion=-1, format_spec=None),
            ],
        )

        if info["required"]:
            statements.append(
                ast.Expr(
                    value=ast.Call(
                        func=load_attribute(["args", "append"]),
                        args=[append_value],
                        keywords=[],
                    ),
                ),
            )
        else:
            statements.append(
                ast.If(
                    test=ast.Compare(
                        left=variable,
                        ops=[ast.IsNot()],
                        comparators=[ast.Name(id="None", ctx=ast.Load())],
                    ),
                    body=[
                        ast.Expr(
                            value=ast.Call(
                                func=load_attribute(["args", "append"]),
                                args=[append_value],
                                keywords=[],
                            ),
                        ),
                    ],
                    orelse=[],
                ),
            )

    return statements


def generate_push_call(token: Enum, name: str, args: dict[str, Argument]) -> ast.Call:
    """Generate the call to push."""
    if not args:
        return ast.Call(
            func=load_attribute(["self", "path", "push"]),
            args=[load_attribute([type(token).__name__, name])],
            keywords=[],
        )

    # we need to generate:
    # self.path.push(f"{<token>.<name>}({ ", ".join(<args>) })"
    #   if args else <token>.<name>)
    return ast.Call(
        func=load_attribute(["self", "path", "push"]),
        args=[
            ast.IfExp(
                test=ast.Name(id="args", ctx=ast.Load()),
                body=ast.JoinedStr(
                    values=[
                        ast.FormattedValue(
                            value=load_attribute([type(token).__name__, name]),
                            conversion=-1,
                            format_spec=None,
                        ),
                        ast.Constant(value="("),
                        ast.FormattedValue(
                            value=ast.Call(
                                func=ast.Attribute(
                                    value=ast.Constant(value=", "),
                                    attr="join",
                                ),
                                args=[ast.Name(id="args", ctx=ast.Load())],
                                keywords=[],
                            ),
                            conversion=-1,
                            format_spec=None,
                        ),
                        ast.Constant(value=")"),
                    ],
                ),
                orelse=load_attribute([type(token).__name__, name]),
            ),
        ],
        keywords=[],
    )


def generate_plain_method(
    token: Enum,
    name: str,
    args: dict[str, Argument],
) -> ast.FunctionDef:
    """Generate a method that ends the path."""
    function_name = name
    while is_keyword_or_builtin(function_name):
        function_name += "_"

    return create_method(
        name=function_name,
        body=[
            generate_method_docstring(token, name),
            *generate_method_argument_body(args),
            ast.Return(value=generate_push_call(token, name, args)),
        ],
        args=args,
        returns=ast.Name(id="Path", ctx=ast.Load()),
    )


def generate_selector_method(
    class_name: str,
    token: Enum,
    name: str,
    args: dict[str, Argument],
    next_type: TypeId,
) -> ast.FunctionDef:
    """Generate a method that continues the path after a selector to a type."""
    next_class_name = get_class_name(next_type)
    next_class_name_set: ast.expr = ast.Name(id=next_class_name, ctx=ast.Load())

    if class_name == next_class_name:
        next_class_name = "Self"
        next_class_name_set = ast.Call(
            func=ast.Name(id="type", ctx=ast.Load()),
            args=[ast.Name(id="self", ctx=ast.Load())],
            keywords=[],
        )

    function_name = name
    while is_keyword_or_builtin(function_name):
        function_name += "_"

    return create_method(
        name=function_name,
        body=[
            generate_method_docstring(token, name),
            *generate_method_argument_body(args),
            ast.Return(
                value=ast.Call(
                    func=ast.Attribute(
                        ast.Call(
                            func=ast.Attribute(
                                value=ast.Subscript(
                                    value=ast.Name(
                                        id="SelectorQueryPath",
                                        ctx=ast.Load(),
                                    ),
                                    slice=ast.Name(id=next_class_name, ctx=ast.Load()),
                                ),
                                attr="from_path",
                                ctx=ast.Load(),
                            ),
                            args=[generate_push_call(token, name, args)],
                            keywords=[],
                        ),
                        attr="set_cls",
                        ctx=ast.Load(),
                    ),
                    args=[next_class_name_set],
                    keywords=[],
                ),
            ),
        ],
        args=args,
        returns=ast.Subscript(
            value=ast.Name(id="SelectorQueryPath", ctx=ast.Load()),
            slice=ast.Name(id=next_class_name),
        ),
    )


def generate_untyped_method(
    token: Enum,
    name: str,
    args: dict[str, Argument],
) -> ast.FunctionDef:
    """Generate a method that continues the path with a wildcard selector."""
    function_name = name
    while is_keyword_or_builtin(function_name):
        function_name += "_"

    return create_method(
        name=function_name,
        body=[
            generate_method_docstring(token, name),
            *generate_method_argument_body(args),
            ast.Return(
                value=ast.Call(
                    func=load_attribute(["UntypedQueryPath", "from_path"]),
                    args=[generate_push_call(token, name, args)],
                    keywords=[],
                ),
            ),
        ],
        args=args,
        returns=ast.Name(id="UntypedQueryPath", ctx=ast.Load()),
    )


def generate_direct_method(
    class_name: str,
    token: Enum,
    name: str,
    args: dict[str, Argument],
    next_type: TypeId,
) -> ast.FunctionDef:
    """Generate a method that continues the path with the specified type."""
    next_class_name = get_class_name(next_type)
    call_from_path_on = next_class_name

    if class_name == next_class_name:
        next_class_name = "Self"
        call_from_path_on = "self"

    function_name = name
    while is_keyword_or_builtin(function_name):
        function_name += "_"

    return create_method(
        name=function_name,
        body=[
            generate_method_docstring(token, name),
            *generate_method_argument_body(args),
            ast.Return(
                value=ast.Call(
                    func=load_attribute([call_from_path_on, "from_path"]),
                    args=[generate_push_call(token, name, args)],
                    keywords=[],
                ),
            ),
        ],
        args=args,
        returns=ast.Name(id=next_class_name, ctx=ast.Load()),
    )


def generate_method(
    class_name: str,
    tokens: Enum,
    method_name: str,
    *,
    config: ConfigurationEntry,
    meta: Meta,
) -> ast.FunctionDef:
    """Generate a method for a path class."""
    arguments = config["arguments"].get(method_name, [])
    args = {key: meta["arguments"][key] for key in arguments}

    if selector := config["selector"].get(method_name, None):
        return generate_selector_method(class_name, tokens, method_name, args, selector)

    if method_name in config["untyped"]:
        return generate_untyped_method(tokens, method_name, args)

    if direct := config["direct"].get(method_name, None):
        return generate_direct_method(class_name, tokens, method_name, args, direct)

    return generate_plain_method(tokens, method_name, args)


def generate_path(
    id_: TypeId,
    config: ConfigurationEntry,
    meta: Meta,
) -> ast.ClassDef:
    """Generate a path class."""
    class_name = get_class_name(id_)

    tokens: type[Enum] = {
        "data_type": DataTypeQueryToken,
        "property_type": PropertyTypeQueryToken,
        "entity_type": EntityTypeQueryToken,
        "entity": EntityQueryToken,
    }[id_]

    body = [
        generate_method(
            class_name,
            token,
            token.name,
            config=config,
            meta=meta,
        )
        for token in tokens
    ]

    return ast.ClassDef(
        name=class_name,
        bases=[ast.Name(id="AbstractQueryPath", ctx=ast.Load())],
        keywords=[],
        body=[
            ast.Expr(
                value=ast.Constant(
                    value=(
                        "A query path for"
                        f" {get_human_readable_name(next(iter(tokens)))}."
                    ),
                ),
            ),
            *body,
        ],
        decorator_list=[],
    )


def imports() -> list[ast.ImportFrom]:
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
            module="graph_sdk.filter.base",
            names=[
                ast.alias(name="AbstractQueryPath", asname=None),
                ast.alias(name="UntypedQueryPath", asname=None),
                ast.alias(name="SelectorQueryPath", asname=None),
            ],
        ),
        ast.ImportFrom(
            module="graph_sdk.query",
            names=[
                ast.alias(name="Path", asname=None),
            ],
        ),
    ]


def doc_comment() -> ast.Expr:
    """Add a doc comment to the top of the file."""
    return ast.Expr(
        value=ast.Constant(
            value=(
                "Definitions for all path objects.\n\nThis file is auto-generated. Do"
                " not edit!"
            ),
        ),
    )


configuration: Configuration = json.loads(
    (DIRECTORY / "graph_sdk" / "filter" / "config.json").read_text(),
)


module = ast.Module(
    body=[
        doc_comment(),
        *imports(),
        generate_path("data_type", configuration["data_type"], configuration["meta"]),
        generate_path(
            "property_type",
            configuration["property_type"],
            configuration["meta"],
        ),
        generate_path(
            "entity_type",
            configuration["entity_type"],
            configuration["meta"],
        ),
        generate_path("entity", configuration["entity"], configuration["meta"]),
    ],
    type_ignores=[],
)

output = ast.unparse(ast.fix_missing_locations(module))

(DIRECTORY / "graph_sdk" / "filter" / "path.py").write_text(f"""
# =========================================
# THIS FILE IS GENERATED, DO NOT CHANGE IT!
# =========================================

{output}""")
