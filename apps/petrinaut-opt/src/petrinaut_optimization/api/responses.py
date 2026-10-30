"""Response declarations shared by the optimization and status routes."""

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """Body of the error responses this service writes itself."""

    detail: str


RUN_NOT_FOUND_RESPONSE: dict[str, object] = {
    "description": "No optimization run with this id is registered",
    "model": ErrorDetail,
}
