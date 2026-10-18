import asyncio, os, functools, threading, http.server, socketserver
from playwright.async_api import async_playwright
ROOT='/home/claude/prototypes/cave-gen'
os.makedirs(ROOT+'/screens',exist_ok=True)
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0), functools.partial(Q, directory=ROOT)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for w in (1280,400):
            for scheme in ('light','dark'):
                pg=await b.new_page(viewport={'width':w,'height':900}, color_scheme=scheme)
                errs=[]
                pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
                pg.on('pageerror', lambda e: errs.append(str(e)))
                # The sandbox has no route to Google Fonts; serve an empty stylesheet so the page uses its fallback stack.
                await pg.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
                await pg.goto(f'http://127.0.0.1:{port}/tests/wrapped.html', wait_until='load')
                await pg.wait_for_timeout(700)
                ov=await pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
                st=await pg.text_content('#status')
                await pg.screenshot(path=f'{ROOT}/screens/cave-lab-{w}-{scheme}.png', full_page=True)
                print(w,scheme,'overflow',ov,'errors',errs,'status',st)
                await pg.close()
        # interaction check
        pg=await b.new_page(viewport={'width':1280,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{port}/tests/wrapped.html'); await pg.wait_for_timeout(300)
        s1=await pg.text_content('#tb-sum')
        await pg.click('#newseed'); await pg.wait_for_timeout(200)
        await pg.select_option('#difficulty','hard'); await pg.wait_for_timeout(200)
        await pg.fill('#seed','12345'); await pg.select_option('#difficulty','standard'); await pg.wait_for_timeout(200)
        s2=await pg.text_content('#tb-sum')
        await pg.mouse.move(400,300); await pg.wait_for_timeout(100)
        print('checksum stable', s1, s2, 'errs', errs, await pg.text_content('#read-elev'))
        await b.close()
asyncio.run(main())
