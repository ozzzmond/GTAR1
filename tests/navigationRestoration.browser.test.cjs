const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const songs = [
  {id:'reload-one',title:'Restoration One',rawContent:'[C]Private chart one',format:'CHORD_PRO',tags:[],createdAt:1,updatedAt:1},
  {id:'reload-two',title:'Restoration Two',rawContent:'[G]Private chart two',format:'CHORD_PRO',tags:[],createdAt:2,updatedAt:2},
]
const setlists = [{id:'reload-gig',name:'Restoration Gig',createdAt:1,updatedAt:1,folderId:null,songs:[
  {id:'reload-one',entryId:'occurrence-a',title:songs[0].title,position:0,transposeOffset:1},
  {id:'reload-one',entryId:'occurrence-b',title:songs[0].title,position:1,transposeOffset:4},
  {id:'reload-two',entryId:'occurrence-c',title:songs[1].title,position:2,transposeOffset:2},
]}, {id:'reload-other',name:'Second Gig',createdAt:2,updatedAt:2,folderId:null,songs:[]}]
async function records(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve,reject) => { const q=indexedDB.open('gtar_revamp_local_v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error) })
    const result = await Promise.all(['songs','setlists'].map(store => new Promise((resolve,reject) => {
      const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)
    })))
    db.close();return result
  })
}
async function seed(page) {
  await page.evaluate(async ({songs,setlists}) => {
    const db = await new Promise((resolve,reject) => { const q=indexedDB.open('gtar_revamp_local_v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error) })
    await new Promise((resolve,reject) => {const tx=db.transaction(['songs','setlists'],'readwrite');songs.forEach(s=>tx.objectStore('songs').put(s));setlists.forEach(s=>tx.objectStore('setlists').put(s));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
    db.close()
  },{songs,setlists})
  await page.reload()
  await page.getByText(songs[0].title,{exact:true}).first().waitFor()
}
async function restore(page, state) {
  await page.evaluate(state => history.replaceState({gtarNavigation:state},'',location.href),state)
  await page.reload()
}
async function tab(page, expected) {
  // Persisted history survives reload before IndexedDB hydration and effect setup.
  // Require a navigation write from this document before acting on restored state.
  await page.waitForFunction(expected=>window.testNavigationReady?.tab===expected && history.state?.gtarNavigation?.tab===expected,expected)
}
async function reader(page) {
  await page.getByRole('button',{name:'Edit Song',exact:true}).waitFor()
  await tab(page,'VIEWER')
}
async function editor(page) {
  await page.locator('textarea').waitFor()
  await tab(page,'EDITOR')
}
async function stage(page) {
  await page.locator('[data-stage-canvas="true"]').waitFor()
  await tab(page,'STAGE')
}

test('Issue 46: real browser reload, history, hydrated references, responsive and offline regression', {timeout:120000}, async () => {
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}
  let server, browser
  try {
    server=http.createServer((req,res)=>{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
      const file=path.join(__dirname,'../dist',name==='/'?'index.html':name)
      if(!fs.existsSync(file)){res.writeHead(404);res.end();return}
      res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream')
      res.end(fs.readFileSync(file))
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const url=`http://127.0.0.1:${server.address().port}/`
    browser=await chromium.launch({headless:true})
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500})
      await context.addInitScript(() => {
        for (const method of ['pushState', 'replaceState']) {
          const original = history[method].bind(history)
          history[method] = (...args) => {
            const result = original(...args)
            window.testNavigationReady = history.state?.gtarNavigation
            return result
          }
        }
      })
      const page=await context.newPage()
      const errors=[]; page.on('pageerror',err=>errors.push(err.message))
      await page.goto(url)
      await page.locator('main[data-explorer-canvas]').waitFor()
      await seed(page)
      const before=await records(page)
      await page.getByText(songs[0].title,{exact:true}).first().click()
      await reader(page)
      await page.reload();await reader(page)
      await page.getByTitle('Enter Stage Performance Mode (Alt+1)').click()
      await stage(page)
      await page.reload();await stage(page)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Stage fits responsive viewport')
      const exitBox=await page.getByRole('button',{name:/Exit Stage/}).boundingBox()
      assert.ok(exitBox.width>=44 && exitBox.height>=44,'Stage exit remains reachable with touch-sized target')
      assert.equal(await page.locator('header h1').textContent(),songs[0].title)
      await page.goBack();await reader(page)
      await page.goForward();await stage(page)
      await page.getByRole('button',{name:/Exit Stage/}).click();await reader(page)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Reader fits responsive viewport')
      await page.getByRole('button',{name:'Edit Song',exact:true}).click();await editor(page)
      await page.reload();await editor(page)
      assert.equal(await page.locator('textarea').inputValue(),songs[0].rawContent)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Editor fits responsive viewport')
      await page.goBack();await reader(page)
      await page.goForward();await editor(page)
      // Conflicting key directives make this a real unsaved draft. Navigation must not replace it.
      const draft='{key: C}\n{key: D}\n[C]Unsaved private draft'
      await page.locator('textarea').fill(draft)
      await page.goBack()
      await page.getByRole('dialog',{name:'Unsaved changes',exact:true}).waitFor()
      assert.equal(await page.locator('textarea').inputValue(),draft)
      await page.getByRole('button',{name:'Cancel',exact:true}).click()
      await page.waitForFunction(()=>history.state?.gtarNavigation?.tab==='EDITOR')
      assert.equal(await page.locator('textarea').inputValue(),draft)
      assert.equal((await records(page))[0][0].rawContent,songs[0].rawContent)
      // Explicitly discard through the existing editor guard before subsequent reload tests.
      await page.goBack()
      await page.getByRole('dialog',{name:'Unsaved changes',exact:true}).waitFor()
      await page.getByRole('button',{name:'Discard',exact:true}).click()
      await reader(page)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Responsive viewport has no horizontal page overflow')
      assert.equal(page.url(),url,'Private song data and identities never enter URLs')
      assert.ok(!JSON.stringify(await page.evaluate(()=>history.state)).includes('Private chart'))
      assert.deepEqual(await records(page),before,'Navigation and reload do not mutate local songs or setlists')
      // Duplicate occurrence and queue position resolve from the canonical setlist after hydration.
      await restore(page,{version:1,tab:'STAGE',setlistId:'reload-gig',nav:{type:'SETLIST',setlistId:'reload-gig'},stage:{songId:'reload-one',entryId:'occurrence-b',index:1,returnTab:'SONGS'}})
      await stage(page)
      assert.equal((await page.getByTestId('stage-queue-counter').textContent()).trim(),'2/3')
      await page.keyboard.press(']')
      await page.waitForFunction(()=>history.state.gtarNavigation.stage.entryId==='occurrence-c')
      await page.reload();await stage(page)
      assert.equal((await page.getByTestId('stage-queue-counter').textContent()).trim(),'3/3')
      assert.equal(await page.locator('header h1').textContent(),songs[1].title)
      await page.getByRole('button',{name:/Exit Stage/}).click();await tab(page,'SONGS')
      assert.equal((await page.evaluate(()=>history.state.gtarNavigation)).nav.setlistId,'reload-gig')
      await restore(page,{version:1,tab:'SETLISTS',setlistId:'reload-gig'})
      await tab(page,'SETLISTS')
      await page.reload();await tab(page,'SETLISTS')
      assert.equal((await page.evaluate(()=>history.state.gtarNavigation)).setlistId,'reload-gig')
      await page.getByText('Second Gig',{exact:true}).last().click()
      await page.waitForFunction(()=>history.state.gtarNavigation.setlistId==='reload-other')
      await page.reload();await tab(page,'SETLISTS')
      assert.equal((await page.evaluate(()=>history.state.gtarNavigation)).setlistId,'reload-other')
      await page.getByRole('heading',{name:'Second Gig',exact:true}).waitFor()
      await page.goBack()
      await page.waitForFunction(()=>history.state.gtarNavigation.setlistId==='reload-gig')
      await page.getByRole('heading',{name:'Restoration Gig',exact:true}).waitFor()
      // Fresh direct entry starts Songbook; this session-state strategy intentionally adds no URL routes.
      const direct=await context.newPage();await direct.goto(url);await tab(direct,'SONGS');await direct.goto(url+'#%malformed-route');await tab(direct,'SONGS');await direct.close()
      for (const state of [{version:1,tab:'VIEWER',songId:'deleted'}, {version:1,tab:'EDITOR',songId:'deleted'}, {version:1,tab:'STAGE',setlistId:'missing',stage:{songId:'reload-one',index:0,returnTab:'SONGS'}}, {version:99,tab:'EDITOR'}, 'malformed', {stage:true}]) {
        await restore(page,state);await tab(page,'SONGS');await page.getByText(songs[0].title,{exact:true}).first().waitFor()
      }
      // Cached PWA shell must really reload with the network disabled, on both viewports.
      await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))})
      const installed = await page.evaluate(async () => ({
        state: (await navigator.serviceWorker.ready).active.state,
        scope: (await navigator.serviceWorker.ready).scope,
        cached: (await Promise.all((await caches.keys()).map(async key =>
          (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)
        ))).flat(),
      }))
      assert.equal(installed.state, 'activated', 'Service worker installs and activates')
      assert.equal(installed.scope, url, 'Worker controls the app root')
      for (const file of ['index.html', 'manifest.webmanifest', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png']) {
        assert.ok(installed.cached.includes('/' + file), `${file} successfully cached`)
      }
      for (const view of ['VIEWER','EDITOR','STAGE','SETLISTS']) {
        await restore(page,{version:1,tab:view,songId:'reload-one',...(view==='STAGE'?{setlistId:'reload-gig',nav:{type:'SETLIST',setlistId:'reload-gig'},stage:{songId:'reload-one',entryId:'occurrence-b',index:1,returnTab:'SONGS'}}:view==='SETLISTS'?{setlistId:'reload-gig'}:{})})
        await tab(page,view)
        await context.setOffline(true)
        await page.reload()
        if(view==='STAGE') {
          await stage(page)
          assert.equal((await page.getByTestId('stage-queue-counter').textContent()).trim(),'2/3')
        } else if(view==='EDITOR') await editor(page)
        else if(view==='SETLISTS') {
          await tab(page,'SETLISTS')
          assert.equal((await page.evaluate(()=>history.state.gtarNavigation)).setlistId,'reload-gig')
          await page.getByText('Restoration Gig',{exact:true}).last().waitFor()
        } else await reader(page)
        const logo = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch('/pwa-192x192.png')).arrayBuffer())))
        assert.ok(Buffer.from(logo).equals(fs.readFileSync(path.join(__dirname,'../dist/pwa-192x192.png'))), 'Offline install/header icon matches emitted branding')
        await context.setOffline(false)
      }
      assert.deepEqual(await records(page),before,'Offline reload and fallbacks preserve canonical records byte-for-byte')
      await restore(page,{version:1,tab:'STAGE',songId:'reload-one',stage:{songId:'reload-one',index:0,returnTab:'SONGS'}})
      await stage(page)
      // A song deleted after the history entry was recorded must never be recreated by restoration.
      await page.evaluate(async()=>{
        const db=await new Promise(resolve=>{const q=indexedDB.open('gtar_revamp_local_v1');q.onsuccess=()=>resolve(q.result)})
        await new Promise(resolve=>{const tx=db.transaction('songs','readwrite');tx.objectStore('songs').delete('reload-one');tx.oncomplete=resolve})
        db.close()
      })
      await page.reload();await tab(page,'SONGS')
      const afterDelete=await records(page)
      assert.deepEqual(afterDelete[0],[songs[1]],'Deleted song stays deleted; remaining song stays unchanged')
      assert.deepEqual(afterDelete[1],before[1],'Deleted-song fallback does not rewrite setlists')
      assert.deepEqual(errors,[],'No browser runtime errors')
      await context.close()
    }
  } finally {
    if(browser) await browser.close()
    if(server) await new Promise(resolve=>server.close(resolve))
  }
})

