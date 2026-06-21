#!/bin/bash
set -e

echo "Instalando yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

echo "Instalando ffmpeg..."
apt-get update -qq && apt-get install -y ffmpeg -qq

echo "Dependências instaladas com sucesso."
