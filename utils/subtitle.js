require('dotenv').config();  
const fs = require('fs');  
const path = require('path');  
const fetch = require('node-fetch');  
const { searchSubtitles } = require('wyzie-lib');  
  
const BASE_DIR = path.join(__dirname, '..', 'subtitles');  
const BATCH_SIZE = 200;  
const TMDB_API_KEY = process.env.TMDB_KEY;  
const TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_KEY;

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
  
async function translateText(text, sourceLang = 'en', targetLang = 'ckb') {
  const encodedText = encodeURIComponent(text);
  const url = `https://translate-pa.googleapis.com/v1/translate?params.client=gtx&query.source_language=${sourceLang}&query.target_language=${targetLang}&query.display_language=en-US&query.text=${encodedText}&key=${TRANSLATE_API_KEY}&data_types=TRANSLATION&data_types=SENTENCE_SPLITS&data_types=BILINGUAL_DICTIONARY_FULL`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Return the translated text
    return data.translation || text;
  } catch (error) {
    console.error('Translation failed for text:', text.substring(0, 50) + '...', error);
    return text; // Return original text as fallback
  }
}

async function translateSubtitle(content) {  
  const lines = content  
    .split('\n')  
    .filter(line => line.trim() && !line.includes('-->') && !/^\d+$/.test(line));  
  
  const translatedLines = [];  
  
  // Translate in batches for better performance
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {  
    const batch = lines.slice(i, i + BATCH_SIZE);  
    
    try {
      // Create promises for all translations in this batch
      const translationPromises = batch.map(line => translateText(line));
      
      // Wait for all translations in this batch to complete
      const batchResults = await Promise.allSettled(translationPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          translatedLines.push(result.value);
        } else {
          console.error('Translation failed for line:', batch[index].substring(0, 50) + '...');
          translatedLines.push(batch[index]); // Use original text as fallback
        }
      });
      
      // Small delay between batches to be respectful to the API
      if (i + BATCH_SIZE < lines.length) {
        await sleep(100);
      }
    } catch (err) {  
      console.error('Batch translation failed, using original text:', err);
      translatedLines.push(...batch); // Use original text as fallback
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