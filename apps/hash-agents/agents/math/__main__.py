from langchain import OpenAI, LLMMathChain
from io_types import Input, Output

llm = OpenAI(temperature=0)
llm_math = LLMMathChain(llm=llm, verbose=True)

def main(query: Input) -> Output:
    return llm_math.run(query)


if __name__ == 'HASH':
    global IN, OUT
    OUT = main(IN)


if __name__ == '__main__':
    print(main("What is 13 raised to the .3432 power?"))
