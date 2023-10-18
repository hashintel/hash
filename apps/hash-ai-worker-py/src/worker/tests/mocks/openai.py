"""Mocks to use in OpenAI tests."""

import os

import pytest
from pytest_mock import MockerFixture


@pytest.fixture()
def set_openai_key(mocker: MockerFixture) -> None:  # noqa: PT004
    """Set OpenAI key from environment variable."""
    mocker.patch.dict(
        os.environ,
        {"OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", "<MOCKED KEY>")},
    )
