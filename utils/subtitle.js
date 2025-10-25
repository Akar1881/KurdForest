const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { searchSubtitles } = require('wyzie-lib');
const tr = require('googletrans');
const translate = tr.default || tr;

const BASE_DIR = path.join(__dirname, '..', 'subtitles');
const BATCH_SIZE = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function downloadSubtitle(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Subtitle download failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('utf8');
}

function srtToVtt(srtContent) {
  let vtt = 'WEBVTT\n\n';
  vtt += srtContent.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4');
  return vtt;
}

async function translateSubtitle(content) {
  const lines = content
    .split('\n')
    .filter(line => line.trim() && !line.includes('-->') && !/^\d+$/.test(line));

  const translatedLines = [];

  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);

    try {
      const result = await translate(batch, { to: 'ckb' });
      translatedLines.push(...result.textArray);
      await sleep(200);
    } catch (err) {
      translatedLines.push(...batch);
    }
  }

  let index = 0;
  return content
    .split('\n')
    .map(line => {
      if (line.trim() && !line.includes('-->') && !/^\d+$/.test(line)) {
        return translatedLines[index++] || line;
      }
      return line;
    })
    .join('\n');
}

async function fetchAndTranslateSubtitle(tmdbId, type, season = null, episode = null) {
  const retries = 3;
  let attempts = 0;

  const folderPath = type === 'movie'
    ? path.join(BASE_DIR, 'movies', String(tmdbId))
    : path.join(BASE_DIR, 'tvshows', String(tmdbId), `season${season}`, `episode${episode}`);

  const vttPath = path.join(folderPath, 'kurdish.vtt');

  if (fs.existsSync(vttPath)) {
    return { success: true, path: vttPath, fromCache: true };
  }

  await ensureDir(folderPath);

  while (attempts < retries) {
    try {
      const searchParams = type === 'movie'
        ? { tmdb_id: tmdbId, format: 'srt' }
        : { tmdb_id: tmdbId, season, episode, format: 'srt' };

      const subs = await searchSubtitles(searchParams);

      if (!subs || !subs.length) {
        throw new Error('No subtitles found');
      }

      const sub = subs.find(s => s.language === 'en') || subs[0];

      const srtContent = await downloadSubtitle(sub.url);
      const translatedSrt = await translateSubtitle(srtContent);
      const vttContent = srtToVtt(translatedSrt);

      fs.writeFileSync(vttPath, vttContent, 'utf8');

      return { success: true, path: vttPath, fromCache: false };
    } catch (err) {
      attempts++;
      if (attempts >= retries) {
        return { success: false, error: err.message };
      }
      await sleep(3000);
    }
  }

  return { success: false, error: 'Failed after 3 attempts' };
}

function getSubtitlePath(tmdbId, type, season = null, episode = null) {
  const folderPath = type === 'movie'
    ? path.join(BASE_DIR, 'movies', String(tmdbId))
    : path.join(BASE_DIR, 'tvshows', String(tmdbId), `season${season}`, `episode${episode}`);

  const vttPath = path.join(folderPath, 'kurdish.vtt');

  return fs.existsSync(vttPath) ? vttPath : null;
}

module.exports = {
  fetchAndTranslateSubtitle,
  getSubtitlePath
};
