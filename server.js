const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const dotenv = require('dotenv');
const { diffWords } = require('diff');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static('public'));

// Ensure uploads dir
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.post('/api/evaluate', upload.single('file'), async (req, res) => {
  try {
    const referenceText = req.body.referenceText || '';
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment' });

    // Send to Groq Whisper
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path));
    form.append('model', 'whisper-large-v3');

    const groqRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const groqData = groqRes.data || {};
    // Groq/Whisper may return text in different fields; try common ones
    const transcript = groqData.text || groqData.transcript || groqData?.data?.text || '';

    // Word-level diff
    const diffs = diffWords(referenceText.trim(), transcript.trim());
    // Build a compact list of mismatches
    const mismatches = [];
    let refIndex = 0;
    let hypIndex = 0;

    diffs.forEach(part => {
      const text = (part.value || '').trim();
      if (!text) return;
      const words = text.split(/\s+/).filter(Boolean);
      if (part.added) {
        // words that were inserted in hypothesis
        mismatches.push({ type: 'insertion', words });
        hypIndex += words.length;
      } else if (part.removed) {
        // words removed from hypothesis (i.e., missing)
        mismatches.push({ type: 'deletion', words });
        refIndex += words.length;
      } else {
        // unchanged
        refIndex += words.length;
        hypIndex += words.length;
      }
    });

    // Simple suggestions: for deletions and insertions show expected vs actual
    const suggestions = mismatches.map((m, i) => {
      if (m.type === 'deletion') {
        return { message: `Missing words: \"${m.words.join(' ')}\"` };
      } else if (m.type === 'insertion') {
        return { message: `Extra words spoken: \"${m.words.join(' ')}\"` };
      } else {
        return { message: `Mismatch: ${JSON.stringify(m)}` };
      }
    });

    // Cleanup uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

    res.json({ transcript, diffs, suggestions });
  } catch (err) {
    console.error('Evaluation error', err?.response?.data || err.message || err);
    res.status(500).json({ error: err?.response?.data || err.message || 'Unknown error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
