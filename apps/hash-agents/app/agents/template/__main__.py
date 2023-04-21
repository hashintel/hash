from typing import Any, Dict, List, Union

import langchain.callbacks
import structlog.stdlib
from beartype import beartype
from langchain import LLMMathChain
from langchain.callbacks.base import BaseCallbackHandler
from langchain.chat_models import ChatOpenAI
from langchain.schema import AgentAction, AgentFinish, LLMResult

from .io_types import Input, Output

logger = structlog.stdlib.get_logger(__name__)


class LoggingCallbackHandler(BaseCallbackHandler):
    def __init__(self):
        super().__init__()

        self.logger = structlog.stdlib.get_logger("langchain")

    def on_llm_start(
        self, serialized: Dict[str, Any], prompts: List[str], **kwargs: Any
    ) -> Any:
        self.logger.debug(
            "llm_start", serialized=serialized, prompts=prompts, kwargs=kwargs
        )

    def on_llm_new_token(self, token: str, **kwargs: Any) -> Any:
        self.logger.debug("llm_new_token", token=token, kwargs=kwargs)

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> Any:
        self.logger.debug("llm_end", response=response, kwargs=kwargs)

    def on_llm_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> Any:
        self.logger.error("llm_error", error=error, kwargs=kwargs)

    def on_chain_start(
        self, serialized: Dict[str, Any], inputs: Dict[str, Any], **kwargs: Any
    ) -> Any:
        self.logger.debug(
            "chain_start", serialized=serialized, inputs=inputs, kwargs=kwargs
        )

    def on_chain_end(self, outputs: Dict[str, Any], **kwargs: Any) -> Any:
        self.logger.debug("chain_end", outputs=outputs, kwargs=kwargs)

    def on_chain_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> Any:
        self.logger.error("chain_error", error=error, kwargs=kwargs)

    def on_tool_start(
        self, serialized: Dict[str, Any], input_str: str, **kwargs: Any
    ) -> Any:
        self.logger.debug(
            "tool_start", serialized=serialized, input_str=input_str, kwargs=kwargs
        )

    def on_tool_end(self, output: str, **kwargs: Any) -> Any:
        self.logger.debug("tool_end", output=output, kwargs=kwargs)

    def on_tool_error(
        self, error: Union[Exception, KeyboardInterrupt], **kwargs: Any
    ) -> Any:
        self.logger.error("tool_error", error=error, kwargs=kwargs)

    def on_text(self, text: str, **kwargs: Any) -> Any:
        self.logger.debug("text", text=text, kwargs=kwargs)

    def on_agent_action(self, action: AgentAction, **kwargs: Any) -> Any:
        self.logger.debug("agent_action", action=action, kwargs=kwargs)

    def on_agent_finish(self, finish: AgentFinish, **kwargs: Any) -> Any:
        self.logger.debug("agent_finish", finish=finish, kwargs=kwargs)


langchain.callbacks.set_handler(LoggingCallbackHandler())


@beartype
def main(agent_input: Input) -> Output:
    """
    Main function of the agent
    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`
    """
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)
    llm_math = LLMMathChain(llm=llm, verbose=True)
    result = llm_math.run(agent_input.expression)
    # ltrim "Answer: " from result
    return Output(result=float(result[8:]))


if __name__ == "HASH":
    """
    This is used when running the agent from the server or the agent orchestrator
    """

    # `IN` and `OUT` are defined by the agent orchestrator
    global IN, OUT
    OUT = main(IN)  # noqa: F821

if __name__ == "__main__":
    """This is used when running the agent from the command line"""
    from ... import setup

    setup()

    output = main(Input(expression="round(pi * 13.37)"))
    logger.info(f"output: {output.result}")
