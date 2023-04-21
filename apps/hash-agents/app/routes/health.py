from fastapi import APIRouter, Response

router = APIRouter()


@router.get("")
async def health() -> Response:
    return Response(status_code=200)
