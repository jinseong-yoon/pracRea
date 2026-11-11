// Feature 2. Needs containers created by the test driver (see run-tests.ps1 / commands in the log):
//   bxt-solo (no label), bxt-web + bxt-db (compose project "bxtproj"), all running redis:7-alpine sleeping.
const names = `[...document.querySelectorAll('[data-testid^=row-]')].map(r=>r.dataset.name)`
export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=container-grid]')`, 'grid rendered')
  // tree: project row exists, children collapsed
  await h.waitFor(`${names}.includes('bxtproj')`, 'project row bxtproj')
  h.assert(!(await h.ev(names)).includes('bxt-web'), 'children hidden while project collapsed')
  await h.click(`[data-name=bxtproj] .caret`)
  await h.waitFor(`${names}.includes('bxt-web') && ${names}.includes('bxt-db')`, 'children visible after expand')
  h.assert((await h.ev(names)).includes('bxt-solo'), 'standalone container listed')
  // default hidden columns
  const heads = await h.ev(`[...document.querySelectorAll('thead th')].map(t=>t.innerText.replace(/[▲▼]/g,'').trim())`)
  h.assert(heads.includes('CPU (%)') && heads.includes('Memory usage/limit') && !heads.includes('Memory (%)') && !heads.includes('PIDS'), 'default columns / hidden columns: ' + heads.join('|'))
  h.assert(heads[heads.length - 1] === 'Actions', 'Actions is last (pinned right)')
  h.assert(await h.ev(`getComputedStyle(document.querySelector('thead th.pin')).position === 'sticky'`), 'Actions column is sticky-pinned')
  // column toggle
  await h.click('.menu > button')
  await h.ev(`[...document.querySelectorAll('.menu-pop label')].find(l=>l.innerText.includes('PIDS')).querySelector('input').click()`)
  h.assert((await h.ev(`[...document.querySelectorAll('thead th')].some(t=>t.innerText.trim()==='PIDS')`)), 'PIDS column can be shown')
  // sort by name desc
  await h.ev(`[...document.querySelectorAll('thead th')].find(t=>t.innerText.startsWith('Name')).click()`) // already asc -> desc
  await h.sleep(200)
  const order = await h.ev(`[...document.querySelectorAll('[data-testid=row-container],[data-testid=row-project]')].map(r=>r.dataset.name).filter(n=>n.startsWith('bxt'))`)
  h.assert(order[0] === 'bxtproj' || order[0] === 'bxt-solo', 'sorted descending, first=' + order[0])
  // state filter
  await h.ev(`(()=>{const s=document.querySelector('select[aria-label="state filter"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'stopped'); s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await h.sleep(300)
  h.assert(!(await h.ev(names)).some((n) => n.startsWith('bxt')), 'stopped filter hides running test containers')
  await h.ev(`(()=>{const s=document.querySelector('select[aria-label="state filter"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,'all'); s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  // multi-select + bulk stop
  await h.click(`[data-name=bxt-web] input[type=checkbox]`)
  await h.click(`[data-name=bxt-db] input[type=checkbox]`)
  await h.waitFor(`!!document.querySelector('[data-testid=bulkbar]')`, 'bulk bar')
  h.assert((await h.text('[data-testid=bulkbar]')).includes('2 selected'), 'two selected')
  await h.ev(`[...document.querySelectorAll('[data-testid=bulkbar] button')].find(b=>b.innerText==='Stop').click()`)
  // live update: no manual refresh; the event stream must flip the dots / project status
  await h.waitFor(`document.querySelector('[data-name=bxtproj] .badge')?.innerText.startsWith('0/2')`, 'project status 0/2 running after bulk stop (event-driven refresh)', 30000)
  await h.shot('containers.png')
}
