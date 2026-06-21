const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Get available formats for a URL
app.post('/api/formats', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const ytdlp = spawn('yt-dlp', [
    '--dump-json',
    '--no-playlist',
    url
  ]);

  let data = '';
  let error = '';

  ytdlp.stdout.on('data', chunk => { data += chunk; });
  ytdlp.stderr.on('data', chunk => { error += chunk; });

  ytdlp.on('close', code => {
    if (code !== 0) {
      return res.status(400).json({ error: 'Não foi possível obter informações do vídeo. Verifique a URL.' });
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

// Download endpoint — streams the file directly to the browser
app.post('/api/download', (req, res) => {
  const { url, format, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const isAudio = type === 'mp3';
  const filename = `download_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
  const outputPath = path.join(DOWNLOADS_DIR, filename);

  const args = isAudio
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outputPath, '--no-playlist', url]
    : ['-f', format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputPath, '--no-playlist', url];

  const ytdlp = spawn('yt-dlp', args);

  let error = '';
  ytdlp.stderr.on('data', chunk => { error += chunk; });

  ytdlp.on('close', code => {
    if (code !== 0 || !fs.existsSync(outputPath)) {
      return res.status(500).json({ error: 'Falha no download. ' + error.slice(0, 200) });
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
