import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1600 })
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)))
page.on('requestfailed', (r) => console.log('REQFAIL:', r.url().slice(0, 100), r.failure()?.errorText))

await page.goto('http://localhost:4173/archive/new', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 800))
await page.type('input[placeholder^="z. B. Nas Illmatic"]', 'Nas Illmatic')
await new Promise(r => setTimeout(r, 1800))
await page.screenshot({ path: '/tmp/af-search.png' })

// pick first result
const first = await page.$('ul.divide-y li button')
if (!first) { console.log('NO RESULTS'); process.exit(1) }
await first.click()
await new Promise(r => setTimeout(r, 2500))
await page.screenshot({ path: '/tmp/af-picked.png' })
const state = await page.evaluate(() => ({
  artist: document.querySelector('input[placeholder="Gang Starr"]').value,
  album: document.querySelector('input[placeholder="Moment of Truth"]').value,
  year: document.querySelector('input[placeholder="1998"]').value,
  artwork: document.querySelector('input[placeholder="https://…"]').value,
  genres: document.querySelector('input[placeholder="East Coast Hip-Hop; Jazz Rap"]').value,
  chips: document.querySelectorAll('button.rounded-sm.border.px-2').length,
}))
console.log('AUTOFILL:', JSON.stringify(state, null, 1))

// toggle two best + one worst via chip text
async function clickChip(label) {
  const els = await page.$$('button.rounded-sm.border.px-2')
  for (const el of els) {
    const txt = await el.evaluate(e => e.textContent)
    if (txt === label) { await el.click(); return true }
  }
  return false
}
console.log('chip The World Is Yours:', await clickChip('The World Is Yours'))
console.log('chip N.Y. State of Mind:', await clickChip('N.Y. State of Mind'))
// worst: pick Halftime -> need it in the WORST section; chips appear twice. Click 2nd occurrence.
const els = await page.$$('button.rounded-sm.border.px-2')
let seen = 0
for (const el of els) {
  const txt = await el.evaluate(e => e.textContent)
  if (txt === 'Halftime') { seen++; if (seen === 2) { await el.click(); break } }
}
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: '/tmp/af-tracks.png' })

// rating 10 + review text + save
const ratingBtns = await page.$$('button.h-9.w-9')
await ratingBtns[9].click()
await page.type('textarea', 'Test-Review.')
const saveBtn = await page.$('xpath/.//button[contains(., "In die Crate legen")]')
await saveBtn.click()
await new Promise(r => setTimeout(r, 1500))
console.log('SAVED URL:', page.url())
await page.goto('http://localhost:4173/archive', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 1500))
await page.screenshot({ path: '/tmp/af-archive.png' })

// also check ATCQ + Gang Starr searches return results
for (const q of ['Gang Starr Moment of Truth', 'A Tribe Called Quest Low End Theory']) {
  await page.goto('http://localhost:4173/archive/new', { waitUntil: 'networkidle0' })
  await page.type('input[placeholder^="z. B. Nas Illmatic"]', q)
  await new Promise(r => setTimeout(r, 1800))
  const count = await page.$$eval('ul.divide-y li button', els => els.length)
  console.log(`SEARCH "${q}": ${count} results`)
}
await browser.close()
console.log('AUTOFILL TEST DONE')
