from langchain import OpenAI, LLMMathChain
from .io_types import *


def main(agent_input: Input):
    llm = OpenAI(temperature=0)
    llm_math = LLMMathChain(llm=llm, verbose=True)
    result = llm_math.run(agent_input.expression)
    # ltrim "Answer: " from result
    return Output(result=float(result[8:]))


if __name__ == 'HASH':
    global IN, OUT
    OUT = main(IN)

if __name__ == '__main__':
    from .. import setup, get_logger
    setup()

    output = main(Input(expression="1 + 2"))
    get_logger().info(f"output: {output.result}")
