const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

let server;
let base;

before(async () => {
  const app = await createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function login(username, password) {
  return fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

test('GET /health mengembalikan status ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'ok' });
});

test('GET /welcome menyapa pengguna', async () => {
  const res = await fetch(`${base}/welcome?name=Budi`);
  assert.match(await res.text(), /Budi/);
});

test('pencarian pengguna berdasarkan nama', async () => {
  const res = await fetch(`${base}/api/users/search?q=Budi`);
  const data = await res.json();
  assert.strictEqual(data.length, 1);
  assert.strictEqual(data[0].username, 'budi');
});

test('login berhasil mengembalikan token', async () => {
  const res = await login('budi', 'budi123');
  assert.strictEqual(res.status, 200);
  assert.ok((await res.json()).token);
});

test('login dengan password salah ditolak', async () => {
  const res = await login('budi', 'salah');
  assert.strictEqual(res.status, 401);
});

test('transfer dari budi ke sari berhasil', async () => {
  const { token } = await (await login('budi', 'budi123')).json();
  const res = await fetch(`${base}/api/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ from: 'budi', to: 'sari', amount: 100000 }),
  });
  assert.strictEqual(res.status, 200);
});

test('transfer tanpa token ditolak', async () => {
  const res = await fetch(`${base}/api/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'budi', to: 'sari', amount: 1000 }),
  });
  assert.strictEqual(res.status, 401);
});
