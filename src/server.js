const minimist = require('minimist');
const config = require('./config');
const { createApp } = require('./app');

// Contoh: node src/server.js --port 8080
const args = minimist(process.argv.slice(2));
const port = args.port || config.port;

createApp().then((app) => {
  app.listen(port, () => console.log(`SecurePay berjalan di http://localhost:${port}`));
});
