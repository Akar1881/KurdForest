require('dotenv').config();  
const fs = require('fs');  
const path = require('path');  
const fetch = require('node-fetch');  
const { searchSubtitles } = require('wyzie-lib');  
  
const BASE_DIR = path.join(__dirname, '..', 'subtitles');  
const BATCH_SIZE = 50; // Smaller batches for better parallelization
const TMDB_API_KEY = process.env.TMDB_KEY;  
const TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_KEY;

// Cache to avoid translating same lines repeatedly
const translationCache = new Map();
let requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 10;

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
  
async function translateTextWithQueue(text, sourceLang = 'en', targetLang = 'ckb') {
  // Check cache first
  const cacheKey = `${sourceLang}-${targetLang}-${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  return new Promise((resolve, reject) => {
    const request = async () => {
      try {
        const encodedText = encodeURIComponent(text);
        const url = `https://translate-pa.googleapis.com/v1/translate?params.client=gtx&query.source_language=${sourceLang}&query.target_language=${targetLang}&query.display_language=en-US&query.text=${encodedText}&key=${TRANSLATE_API_KEY}&data_types=TRANSLATION&data_types=SENTENCE_SPLITS&data_types=BILINGUAL_DICTIONARY_FULL`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Translation API error: ${response.status}`);
        }
        
        const data = await response.json();
        const translated = data.translation || text;
        
        // Cache the result
        translationCache.set(cacheKey, translated);
        resolve(translated);
      } catch (error) {
        console.error('Translation failed for text:', text.substring(0, 50) + '...', error);
        resolve(text); // Return original as fallback
      } finally {
        activeRequests--;
        processQueue();
      }
    };

    requestQueue.push(request);
    processQueue();
  });
}

function processQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    const request = requestQueue.shift();
    request();
  }
}

async function translateSubtitle(content) {  
  const lines = content  
    .split('\n')  
    .filter(line => line.trim() && !line.includes('-->') && !/^\d+$/.test(line));  
  
  console.log(`Translating ${lines.length} subtitle lines...`);
  
  // Group similar lines to reduce API calls
  const uniqueLines = [...new Set(lines)];
  console.log(`Reduced to ${uniqueLines.length} unique lines for translation`);
  
  const translationMap = new Map();
  
  // Translate all unique lines in parallel
  const translationPromises = uniqueLines.map(line => 
    translateTextWithQueue(line).then(translated => ({
      original: line,
      translated: translated
    }))
  );
  
  const results = await Promise.allSettled(translationPromises);
  
  // Build translation map
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      translationMap.set(result.value.original, result.value.translated);
    }
  });
  
  // Reconstruct the content with translations
  let lineIndex = 0;
  return content  
    .split('\n')  
    .map(line => {  
      if (line.trim() && !line.includes('-->') && !/^\d+$/.test(line)) {  
        return translationMap.get(line) || line;  
      }  
      return line;  
    })  
    .join('\n');  
}

// 🆕 Fetch IMDb ID from TMDb API  
async function fetchImdbId(tmdbId, type) {  
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;  
  try {  
    const res = await fetch(url);  
    if (!res.ok) throw new Error(`HTTP ${res.status}`);  
    const data = await res.json();  
    return data.imdb_id || null;  
  } catch (err) {  
    console.error('Failed to fetch IMDb ID:', err);  
    return null;  
  }  
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
  
  // 🆕 Step 1: Get IMDb ID from TMDb  
  const imdbId = await fetchImdbId(tmdbId, type);  
  console.log(`Fetched IMDb ID for TMDb ${tmdbId}: ${imdbId}`);  
  
  while (attempts < retries) {  
    try {  
      // 🆕 Step 2: Prefer IMDb ID search, fallback to TMDb ID  
      const searchParams = imdbId  
        ? (type === 'movie'  
            ? { imdb_id: imdbId, format: 'srt' }  
            : { imdb_id: imdbId, season, episode, format: 'srt' })  
        : (type === 'movie'  
            ? { tmdb_id: tmdbId, format: 'srt' }  
            : { tmdb_id: tmdbId, season, episode, format: 'srt' });  
  
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
