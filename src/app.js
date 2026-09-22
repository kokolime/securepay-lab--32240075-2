const express = require('express');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const config = require('./config');
const { createDb, hashPassword, all, allBound } = require('./db');

async function createApp() {
  const app = express();
  const db = await createDb();
  let settings = _.cloneDeep(config.defaultSettings);

  app.use(express.json());

  // Middleware autentikasi JWT
  function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '');
    try {
      req.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch (err) {
      res.status(401).json({ error: 'Token tidak valid' });
    }
  }

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Halaman sambutan
  app.get('/welcome', (req, res) => {
    const name = req.query.name || 'Tamu';
    res.send(`<h1>Selamat datang di SecurePay, ${name}!</h1>`);
  });

  // Login -> mengembalikan JWT
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const rows = allBound(
      db,
      'SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?',
      [username, hashPassword(String(password))]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Username atau password salah' });
    const token = jwt.sign({ id: rows[0].id, username: rows[0].username, role: rows[0].role }, config.jwtSecret, {
      expiresIn: '1h',
    });
    res.json({ token });
  });

  // Cari pengguna berdasarkan nama
  app.get('/api/users/search', (req, res) => {
    const q = req.query.q || '';
    const rows = all(db, `SELECT id, username, full_name FROM users WHERE full_name LIKE '%${q}%'`);
    res.json(rows);
  });

  // Detail pengguna berdasarkan id
  app.get('/api/users/:id', (req, res) => {
    const rows = all(db, 'SELECT id, username, full_name, role FROM users WHERE id = ' + req.params.id);
    if (rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    res.json(rows[0]);
  });

  // Transfer uang antar pengguna
  app.post('/api/transfer', requireAuth, (req, res) => {
    const { from, to, amount } = req.body;
    const sender = allBound(db, 'SELECT * FROM users WHERE username = ?', [from])[0];
    const receiver = allBound(db, 'SELECT * FROM users WHERE username = ?', [to])[0];
    if (!sender || !receiver) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    if (sender.balance < amount) return res.status(400).json({ error: 'Saldo tidak cukup' });

    db.run('UPDATE users SET balance = balance - ? WHERE username = ?', [amount, from]);
    db.run('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, to]);
    res.json({ message: 'Transfer berhasil', from, to, amount });
  });

  // Lihat saldo
  app.get('/api/balance/:username', requireAuth, (req, res) => {
    const rows = allBound(db, 'SELECT username, balance FROM users WHERE username = ?', [req.params.username]);
    if (rows.length === 0) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    res.json(rows[0]);
  });

  // Ubah pengaturan aplikasi (digabung dengan pengaturan yang ada)
  app.post('/api/settings', requireAuth, (req, res) => {
    settings = _.merge(settings, req.body);
    res.json(settings);
  });

  // Penanganan error
  app.use((err, req, res, next) => {
    res.status(500).send(`<pre>${err.stack}</pre>`);
  });

  return app;
}

module.exports = { createApp };
