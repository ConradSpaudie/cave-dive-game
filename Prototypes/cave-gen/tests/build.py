import os
SP=os.path.dirname(os.path.abspath(__file__))
t=open(SP+'/template.html').read(); g=open('/home/claude/prototypes/cave-gen/generator.js').read()
assert '</script' not in g
out=t.replace('/*__GENERATOR__*/', g)
open('/home/claude/prototypes/cave-gen/index.html','w').write(out)
os.makedirs('/home/claude/prototypes/cave-gen/tests',exist_ok=True)
open('/home/claude/prototypes/cave-gen/tests/wrapped.html','w').write('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>'+out+'</body></html>')
print('built', len(out))
