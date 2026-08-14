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

    // Basic validations
    if (!req.file) {
      console.error('No file in request (req.file is undefined). req.body keys:', Object.keys(req.body));
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Log file info
    const filePath = req.file.path;
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    console.log('Received upload:', filePath, 'size=', stat ? stat.size : 'n/a');

    if (!stat || stat.size === 0) {
      try { if (stat) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      console.error('Uploaded file is empty or missing, aborting.');
      return res.status(400).json({ error: { message: 'Uploaded file is empty', type: 'invalid_request_error' } });
    }

    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment' });

    // Send to Groq Whisper
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('model', 'whisper-large-v3');

    let groqRes;
    try {
      groqRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (err) {
      console.error('Error calling Groq API:', err?.response?.data || err.message || err);
      // cleanup
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      return res.status(500).json({ error: err?.response?.data || err.message || 'Groq transcription error' });
    }

    const groqData = groqRes.data || {};
    const transcript = groqData.text || groqData.transcript || groqData?.data?.text || '';

    // Word-level diff
    const diffs = diffWords(referenceText.trim(), transcript.trim());
    const mismatches = [];

    diffs.forEach(part => {
      const text = (part.value || '').trim();
      if (!text) return;
      const words = text.split(/\s+/).filter(Boolean);
      if (part.added) {
        mismatches.push({ type: 'insertion', words });
      } else if (part.removed) {
        mismatches.push({ type: 'deletion', words });
      }
    });

    const suggestions = mismatches.map((m) => {
      if (m.type === 'deletion') return { message: `Missing words: "${m.words.join(' ')}"` };
      if (m.type === 'insertion') return { message: `Extra words spoken: "${m.words.join(' ')}"` };
      return { message: `Mismatch: ${JSON.stringify(m)}` };
    });

    // Cleanup uploaded file
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

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
