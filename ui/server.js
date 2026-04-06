const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const mediatypesRouter = require('./db/mediatypes');
const mediasourcesRouter = require('./db/mediasources');
const mediasRouter = require('./db/medias');
const scanRouter = require('./db/scan');
const searchRouter = require('./db/search');

const app = express();
const UI_PORT = parseInt(process.env.UI_PORT) || 3000;
const EXPRESS_PORT = UI_PORT + 1;
const CONFIG_PATH = path.join(__dirname, 'serverconfig.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

app.use(express.json());

// -- Config API ---------------------------------------------------------------
app.get('/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/config', (req, res) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -- Database API -------------------------------------------------------------
app.use('/db/mediatypes', mediatypesRouter);
app.use('/db/mediasources', mediasourcesRouter);
app.use('/db/search', searchRouter);
app.use('/db/medias', mediasRouter);
app.use('/scan', scanRouter);

app.listen(EXPRESS_PORT, '127.0.0.1', () => {
  console.log(`[Express] Config + DB server -> http://127.0.0.1:${EXPRESS_PORT}`);
});