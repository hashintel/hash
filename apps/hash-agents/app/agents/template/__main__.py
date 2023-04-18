from langchain import LLMMathChain
from langchain.chat_models import ChatOpenAI
from .io_types import *


def main(agent_input: Input) -> Output:
    llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0)
    llm_math = LLMMathChain(llm=llm, verbose=True)
    result = llm_math.run(agent_input.expression)
    # ltrim "Answer: " from result
    return Output(result=float(result[8:]))


if __name__ == "HASH":
    global IN, OUT
    OUT = main(IN)

if __name__ == "__main__":
    from ... import setup
    from logging import getLogger

    setup()

    output = main(Input(expression="round(pi * 13.37)"))
    getLogger().info(f"output: {output.result}")
