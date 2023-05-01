# The underlying base class (`BaseCallbackHandler`) uses `Any` a lot
# ruff: noqa: ANN401

"""Contains logic for configuring LangChain's logging."""
from typing import Any

import structlog.stdlib
from langchain.callbacks.base import BaseCallbackHandler
from langchain.schema import AgentAction, AgentFinish, LLMResult

logger = structlog.stdlib.get_logger(__name__)


class LoggingCallbackHandler(BaseCallbackHandler):
    """Logs the events emitted by LangChain."""

    def __init__(self) -> None:  # noqa: D107
        super().__init__()

        self.logger = structlog.stdlib.get_logger("langchain")

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        **kwargs: Any,
    ) -> Any:
        """Run when LLM starts running."""
        self.logger.debug(
            "llm_start",
            serialized=serialized,
            prompts=prompts,
            kwargs=kwargs,
        )

    def on_llm_new_token(self, token: str, **kwargs: Any) -> Any:
        """Run when LLM generates a new token."""
        self.logger.debug("llm_new_token", token=token, kwargs=kwargs)

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> Any:
        """Run when LLM ends running."""
        self.logger.debug("llm_end", response=response, kwargs=kwargs)

    def on_llm_error(self, error: Exception | KeyboardInterrupt, **kwargs: Any) -> Any:
        """Run when LLM errors."""
        self.logger.error("llm_error", error=error, kwargs=kwargs)

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        **kwargs: Any,
    ) -> Any:
        """Run when chain starts running."""
        self.logger.debug(
            "chain_start",
            serialized=serialized,
            inputs=inputs,
            kwargs=kwargs,
        )

    def on_chain_end(self, outputs: dict[str, Any], **kwargs: Any) -> Any:
        """Run when chain ends running."""
        self.logger.debug("chain_end", outputs=outputs, kwargs=kwargs)

    def on_chain_error(
        self,
        error: Exception | KeyboardInterrupt,
        **kwargs: Any,
    ) -> Any:
        """Run when chain errors."""
        self.logger.error("chain_error", error=error, kwargs=kwargs)

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> Any:
        """Run when tool starts running."""
        self.logger.debug(
            "tool_start",
            serialized=serialized,
            input_str=input_str,
            kwargs=kwargs,
        )

    def on_tool_end(self, output: str, **kwargs: Any) -> Any:
        """Run when tool ends running."""
        self.logger.debug("tool_end", output=output, kwargs=kwargs)

    def on_tool_error(self, error: Exception | KeyboardInterrupt, **kwargs: Any) -> Any:
        """Run when tool errors."""
        self.logger.error("tool_error", error=error, kwargs=kwargs)

    def on_text(self, text: str, **kwargs: Any) -> Any:
        """Run on additional input from chains and agents."""
        self.logger.debug("text", text=text, kwargs=kwargs)

    def on_agent_action(self, action: AgentAction, **kwargs: Any) -> Any:
        """Run when tool starts running."""
        self.logger.debug("agent_action", action=action, kwargs=kwargs)

    def on_agent_finish(self, finish: AgentFinish, **kwargs: Any) -> Any:
        """Run on agent end."""
        self.logger.debug("agent_finish", finish=finish, kwargs=kwargs)
