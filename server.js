const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Write cookies from env variable (base64 encoded) to a temp file
const COOKIES_PATH = path.join('/tmp', 'yt_cookies.txt');
if (process.env.YT_COOKIES) {
  try {
    const decoded = Buffer.from(process.env.YT_COOKIES, 'base64').toString('utf8').replace(/^﻿/, '');
    fs.writeFileSync(COOKIES_PATH, decoded, 'utf8');
  } catch {
    fs.writeFileSync(COOKIES_PATH, process.env.YT_COOKIES.replace(/^﻿/, ''), 'utf8');
  }
}

const YTDLP_BASE_ARGS = [
  '--no-playlist',
  '--extractor-args', 'youtube:player_client=android,tv_embedded',
  '--user-agent', 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
  '--no-check-certificates',
  '--geo-bypass',
  ...(process.env.YT_COOKIES ? ['--cookies', COOKIES_PATH] : []),
];

app.post('/api/formats', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const ytdlp = spawn('yt-dlp', ['--dump-json', ...YTDLP_BASE_ARGS, url]);

  let data = '';
  let error = '';

  ytdlp.stdout.on('data', chunk => { data += chunk; });
  ytdlp.stderr.on('data', chunk => { error += chunk; });

  ytdlp.on('close', code => {
    if (code !== 0) {
      console.error('yt-dlp error:', error);
      return res.status(400).json({ error: error.slice(-300) || 'Não foi possível obter informações do vídeo.' });
    }
    try {
      const info = JSON.parse(data);
      const videoFormats = (info.formats || [])
        .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4')
        .map(f => ({ id: f.format_id, label: `MP4 ${f.height || '?'}p`, height: f.height || 0 }))
        .filter((f, i, arr) => arr.findIndex(x => x.height === f.height) === i)
        .sort((a, b) => b.height - a.height);

      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration_string || '',
        formats: videoFormats
      });
    } catch {
      res.status(500).json({ error: 'Erro ao processar informações do vídeo.' });
    }
  });
});

app.post('/api/download', (req, res) => {
  const { url, format, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const isAudio = type === 'mp3';
  const filename = `download_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
  const outputPath = path.join(DOWNLOADS_DIR, filename);

  const formatArgs = isAudio
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
    : ['-f', format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4'];

  const ytdlp = spawn('yt-dlp', [...formatArgs, ...YTDLP_BASE_ARGS, '-o', outputPath, url]);

  let error = '';
  ytdlp.stderr.on('data', chunk => { error += chunk; });

  ytdlp.on('close', code => {
    if (code !== 0 || !fs.existsSync(outputPath)) {
      console.error('yt-dlp download error:', error);
      return res.status(500).json({ error: 'Falha no download. ' + error.slice(0, 300) });
    }

    const stat = fs.statSync(outputPath);
    const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    const downloadName = isAudio ? 'audio.mp3' : 'video.mp4';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => fs.unlink(outputPath, () => {}));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
