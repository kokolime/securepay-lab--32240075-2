const express = require('express');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const config = require('./config');
const { createDb, verifyPassword, allBound } = require('./db');

// Helper function untuk sanitasi HTML (Output Encoding Mencegah XSS)
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  // Halaman sambutan (Mencegah XSS dengan escapeHtml)
  app.get('/welcome', (req, res) => {
    const name = req.query.name || 'Tamu';
    const safeName = escapeHtml(name);
    res.send(`<h1>Selamat datang di SecurePay, ${safeName}!</h1>`);
  });

  // Login -> mengembalikan JWT
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // Parameterized Query untuk mencegah SQL Injection
    const rows = allBound(
      db,
      'SELECT id, username, role, password_hash FROM users WHERE username = ?',
      [username]
    );

    const user = rows[0];

    // Verifikasi password menggunakan fungsi verifyPassword dari db.js
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    res.json({ token });
  });

  // Cari pengguna berdasarkan nama (Parameterized Query)
  app.get('/api/users/search', (req, res) => {
    const q = req.query.q || '';
    const rows = allBound(
      db,
      'SELECT id, username, full_name FROM users WHERE full_name LIKE ?',
      [`%${q}%`]
    );
    res.json(rows);
  });

  // Detail pengguna berdasarkan id (Validasi angka + Parameterized Query)
  app.get('/api/users/:id', (req, res) => {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'ID tidak valid' });
    }

    const rows = allBound(
      db,
      'SELECT id, username, full_name, role FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    res.json(rows[0]);
  });

  // Transfer uang antar pengguna (Mencegah Impersonation, Self-transfer & Negative Amount)
  app.post('/api/transfer', requireAuth, (req, res) => {
    const { from, to, amount } = req.body;

    // 1. Mencegah Impersonation / IDOR
    if (req.user.username !== from) {
      return res.status(403).json({ error: 'Anda tidak diizinkan mentransfer dari akun ini' });
    }

    // 2. Mencegah Transfer ke Diri Sendiri
    if (from === to) {
      return res.status(400).json({ error: 'Tidak dapat mentransfer ke akun sendiri' });
    }

    // 3. Mencegah Nominal Negatif / Non-Angka
    if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: 'Jumlah transfer harus berupa angka positif' });
    }

    const sender = allBound(db, 'SELECT * FROM users WHERE username = ?', [from])[0];
    const receiver = allBound(db, 'SELECT * FROM users WHERE username = ?', [to])[0];

    if (!sender || !receiver) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    if (sender.balance < amount) return res.status(400).json({ error: 'Saldo tidak cukup' });

    db.run('UPDATE users SET balance = balance - ? WHERE username = ?', [amount, from]);
    db.run('UPDATE users SET balance = balance + ? WHERE username = ?', [amount, to]);

    res.json({ message: 'Transfer berhasil', from, to, amount });
  });

  // Lihat saldo (Mencegah BOLA / IDOR)
  app.get('/api/balance/:username', requireAuth, (req, res) => {
    const { username } = req.params;

    if (req.user.username !== username) {
      return res.status(403).json({ error: 'Anda tidak diizinkan melihat saldo akun ini' });
    }

    const rows = allBound(db, 'SELECT username, balance FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    res.json(rows[0]);
  });

  // Ubah pengaturan aplikasi (Diperbaiki: Mencegah Prototype Pollution)
  app.post('/api/settings', requireAuth, (req, res) => {
    // Hanya izinkan pengguna dengan role 'admin' mengubah settings
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak: Membutuhkan role admin' });
    }

    // Hindari deep merge langsung dari req.body untuk cegah Prototype Pollution
    const allowedKeys = ['theme', 'notifications', 'language', 'maintenanceMode'];
    const updateData = {};

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }

    settings = { ...settings, ...updateData };
    res.json(settings);
  });

  // Penanganan error (Sembunyikan stack trace dari pengguna)
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan internal pada server' });
  });

  return app;
}

module.exports = { createApp };