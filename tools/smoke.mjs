// Standalone client smoke test: drive the real Chrome against the running game,
// click FIRE LASER, and report what happens (bridge standalone path, optics,
// renderer, history) with full console capture.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://localhost:8080/';

const logs = [];
const errors = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#fireBtn', { timeout: 10000 });

  const disabled = await page.$eval('#fireBtn', (el) => el.disabled);
  const balBefore = await page.$eval('#balanceDisplay', (el) => el.textContent);
  const chipsBefore = await page.$$eval('#historyChips .chip', (els) => els.length);
  console.log('fireBtn disabled at start:', disabled, '| balance:', balBefore, '| chips:', chipsBefore);

  await page.click('#fireBtn');

  let settled = false;
  try {
    await page.waitForFunction((n) => document.querySelectorAll('#historyChips .chip').length > n, { timeout: 20000 }, chipsBefore);
    settled = true;
  } catch { /* report below */ }

  const balAfter = await page.$eval('#balanceDisplay', (el) => el.textContent);
  const chipsAfter = await page.$$eval('#historyChips .chip', (els) => els.map((e) => e.textContent));
  const vrf = await page.$eval('#vrfHash', (el) => el.textContent);

  console.log('settled(new chip):', settled);
  console.log('balance:', balBefore, '->', balAfter);
  console.log('history chips now:', chipsAfter.join(', '));
  console.log('vrf seed shown:', vrf.slice(0, 20) + '…');
  console.log('console errors:', errors.length ? errors : 'none');
  console.log('--- last console logs ---');
  console.log(logs.slice(-15).join('\n'));

  if (!settled || errors.length) process.exit(1);
  console.log('\nSMOKE PASS');
} finally {
  await browser.close();
}
