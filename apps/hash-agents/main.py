import runpy

if __name__ == '__main__':
    out = runpy.run_module('agents.template', run_name='agent_invocation', init_globals={
        'IN': 'Hello templdsaate',
    }).get('OUT')
    print(out)
