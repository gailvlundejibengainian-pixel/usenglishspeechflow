# US English Speech Flow — Local evaluation with Groq Whisper

This is a minimal personal project to record/upload short spoken clips, transcribe them with Groq Whisper, and compare the transcript to a provided reference text to show mismatches.

WARNING: Do NOT commit your API keys into this repository. Use environment variables as shown below.

## Setup (local)

1. Copy .env.example to `.env` and add your Groq API key:

   GROQ_API_KEY=your_real_groq_api_key_here

2. Install and run:

   npm install
   npm start

3. Open http://localhost:3000 in your browser.

## How it works

- Frontend (public/index.html) lets you paste a reference text, record audio, and upload it.
- Backend (server.js) receives the audio file and reference text, forwards the audio to Groq Whisper for transcription, then runs a simple word-diff and returns suggestions.

## Notes and next steps

- This is a minimal prototype for local use. If you want more advanced phoneme-level alignment or pronunciation scoring (like SpeechShot), we can integrate forced-alignment tools or cloud pronunciation assessment APIs.
- Keep your GROQ API key private. Do not push it to remote repos.
