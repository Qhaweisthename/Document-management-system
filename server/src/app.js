require('dotenv').config();
const express    = require('express');
const { Pool }   = require('pg');
//const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
//const helmet     = require('helmet');
//const rateLimit  = require('express-rate-limit');

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Running...");
});

module.exports = app;