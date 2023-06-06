"""A template agent, which provides a simple interface into LangChain's LLMMathChain."""

from beartype import beartype
from langchain import LLMMathChain
from langchain.chat_models import ChatOpenAI

from .io_types import Input, Output


@beartype
def execute(agent_input: Input) -> Output:
    """Calls LLMMathChain with the given input.

    :param agent_input: Input defined in `io_types.ts`
    :return: Output defined in `io_types.ts`.
    """
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)
    llm_math = LLMMathChain(llm=llm, verbose=True)
    result = llm_math.run(agent_input.expression)
    # ltrim "Answer: " from result
    return Output(result=float(result[8:]))
