const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { findBrowser } = require('./browser.cjs');
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: findBrowser(), pipe: true, headless: true,
    args: ['--disable-background-networking', '--disable-quic', '--disable-sync', '--no-first-run',
      '--proxy-server=127.0.0.1:1', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url() === 'http://localhost/synthetic') return request.respond({ status: 200, contentType: 'text/html', body: '<body></body>' });
      if (request.url() === 'http://localhost/favicon.ico') return request.respond({ status: 204 });
      if (/^(?:blob:|data:)/.test(request.url())) return request.continue();
      requests.push(request.url()); return request.abort();
    });
    await page.goto('http://localhost/synthetic');
    const source = readFileSync(join(__dirname, '../main.js'), 'utf8');
    const scenario = readFileSync(join(__dirname, 'markdown-scenario.cjs'), 'utf8');
    const results = await page.evaluate(async ({ source, scenario }) => {
      const api = { Plugin: class {}, Modal: class {}, Notice: class {}, PluginSettingTab: class {} };
      const lib = new Function('require', 'module', source + '\nreturn { xml, LocalMermaid, MERMAID_ERROR, markdownLines, toStorage, fromStorage };')(() => api, { exports: {} });
      const fixture = { exports: {} };
      new Function('module', scenario)(fixture);
      return fixture.exports(lib);
    }, { source, scenario });
    if (requests.length) throw new Error('Diagram attempted an external request: ' + JSON.stringify(requests));
    console.log(JSON.stringify({ markdown: results, externalRequests: requests.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
