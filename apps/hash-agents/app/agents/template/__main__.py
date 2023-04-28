import structlog.stdlib
from beartype import beartype
from langchain import LLMMathChain
from langchain.chat_models import ChatOpenAI

from .io_types import Input, Output

logger = structlog.stdlib.get_logger(__name__)


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
