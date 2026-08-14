#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const examplePath = path.join(__dirname, '..', '.env.example');
const destPath = path.join(__dirname, '..', '.env');

if (!fs.existsSync(examplePath)) {
  console.error('.env.example not found. Please create one first.');
  process.exit(1);
}

if (fs.existsSync(destPath)) {
  console.log('.env already exists — leaving it unchanged.');
  process.exit(0);
}

try {
  const content = fs.readFileSync(examplePath, 'utf8');
  fs.writeFileSync(destPath, content, { mode: 0o600 });
  console.log('Created .env from .env.example.');
  console.log('Remember NOT to commit your real API keys to the repo.');
} catch (err) {
  console.error('Failed to create .env:', err.message || err);
  process.exit(1);
}
