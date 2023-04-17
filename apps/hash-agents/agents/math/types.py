from typing import Any, TypeVar, Type, cast


T = TypeVar("T")


def from_str(x: Any) -> str:
    assert isinstance(x, str)
    return x


def to_class(c: Type[T], x: Any) -> dict:
    assert isinstance(x, c)
    return cast(Any, x).to_dict()


class Input:
    """Math expression to evaluate"""
    expression: str

    def __init__(self, expression: str) -> None:
        self.expression = expression

    @staticmethod
    def from_dict(obj: Any) -> 'Input':
        assert isinstance(obj, dict)
        expression = from_str(obj.get("expression"))
        return Input(expression)

    def to_dict(self) -> dict:
        result: dict = {}
        result["expression"] = from_str(self.expression)
        return result


class Output:
    """Math expression result"""
    result: str

    def __init__(self, result: str) -> None:
        self.result = result

    @staticmethod
    def from_dict(obj: Any) -> 'Output':
        assert isinstance(obj, dict)
        result = from_str(obj.get("result"))
        return Output(result)

    def to_dict(self) -> dict:
        result: dict = {}
        result["result"] = from_str(self.result)
        return result


def input_from_dict(s: Any) -> Input:
    return Input.from_dict(s)


def input_to_dict(x: Input) -> Any:
    return to_class(Input, x)


def output_from_dict(s: Any) -> Output:
    return Output.from_dict(s)


def output_to_dict(x: Output) -> Any:
    return to_class(Output, x)
