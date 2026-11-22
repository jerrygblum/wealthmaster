// Synthetic acceptance helpers, executed only inside the isolated demo test network.
const { request } = require('/work/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const mode = process.argv[2];
  const client = await request.newContext({
    baseURL: 'https://demo-tls', ignoreHTTPSErrors: true,
    ...(mode === 'quota' ? { storageState: '/sessions/demo-session-desktop.json' } : {}),
  });
  try {
    if (mode === 'quota') {
      const token = await (await client.get('/api/v1/auth/csrf')).json();
      const result = await client.post('/api/v1/accounts', { headers: { [token.headerName]: token.token }, data: {} });
      assert.equal(result.status(), 429);
      assert.match((await result.json()).message, /editing limit/);
      assert.equal(result.headers()['retry-after'], '60');
      assert.equal((await client.get('/api/v1/accounts')).status(), 200);
      console.log('Durable quota is enforced through Nginx, while financial reads remain available.');
    } else if (mode === 'rate') {
      const responses = await Promise.all(Array.from({ length: 300 }, () => client.get('/api/v1/auth/demo')));
      const limited = responses.filter(r => r.status() === 429);
      assert(limited.length > 0, 'Expected the global demo request rate limit');
      assert.equal(limited[0].headers()['retry-after'], '60');
      assert.match((await limited[0].json()).message, /shared demo is busy/);
      console.log('Demo Nginx rate limit returns 429 and retry guidance.');
    } else if (mode === 'maintenance') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const result = await client.get('/api/v1/auth/demo');
      assert.equal(result.status(), 503);
      assert.equal(result.headers()['retry-after'], '30');
      assert.match((await result.json()).message, /being restored/);
      console.log('Stopped demo backend produces friendly 503 maintenance feedback over HTTPS.');
    } else throw new Error('Unknown acceptance check');
  } finally { await client.dispose(); }
})().catch(error => { console.error(error); process.exit(1); });
