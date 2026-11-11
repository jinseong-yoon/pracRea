// Feature 5: interactive terminal over a bidirectional stream. Uses container bxt-solo.
const bufferText = `(()=>{const b=window.__term.buffer.active; let s=''; for(let i=0;i<b.length;i++) s+=(b.getLine(i)?.translateToString(true)??'')+'\\n'; return s})()`
// term.input(data, true) goes through the same path as a keystroke (fires onData)
const type = (h, text) => h.ev(`window.__term.input(${JSON.stringify(text)}, true)`)

export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-name=bxt-solo] .link')`, 'bxt-solo row')
  await h.ev(`document.querySelector('[data-name=bxt-solo] .link').click()`)
  await h.click('[data-testid=tab-exec]')
  await h.waitFor(`document.querySelector('[data-testid=exec-status]')?.innerText==='open'`, 'terminal connected', 20000)
  await h.sleep(600)
  await type(h, 'echo hello-from-$((6*7))\r')
  await h.waitFor(`${bufferText}.includes('hello-from-42')`, 'command output (input and output both flow)', 10000)

  // `stty size` prints "rows cols" exactly as the pty sees them
  await type(h, 'stty size\r')
  await h.sleep(800)
  const cols0 = await h.ev('window.__term.cols')
  const rows0 = await h.ev('window.__term.rows')
  const text = await h.ev(bufferText)
  h.assert(text.split('\n').some((l) => l.trim() === `${rows0} ${cols0}`), `pty size equals xterm size: ${rows0} ${cols0}`)

  // window size reflected: shrink the host box, the pty must follow
  await h.ev(`document.querySelector('[data-testid=terminal]').style.maxWidth='420px'`)
  await h.waitFor(`window.__term.cols < ${cols0}`, 'xterm refits after the container is resized')
  const cols1 = await h.ev('window.__term.cols')
  await h.sleep(600)
  await type(h, 'clear; stty size\r')
  await h.waitFor(`${bufferText}.split('\\n').some(l=>l.trim().endsWith(' ${cols1}'))`, `pty width follows resize (${cols0} -> ${cols1})`, 8000)
  await h.shot('exec.png')
  // leaving the tab closes the stream and ends the exec'd shell
  await h.click('[data-testid=tab-logs]')
  await h.sleep(1500)
}
