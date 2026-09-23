const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Netscape Cookies Setup
const COOKIES_PATH = path.join('/tmp', 'cookies.txt');

function setupCookies() {
    if (process.env.YOUTUBE_COOKIES) {
        fs.writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES);
    }
}
setupCookies();

// Dynamic Player Clients to bypass PO Token requirement cleanly
const EXTRACTOR_ARGS = 'youtube:player_client=mweb,web';

// -------------------------------------------------------------
// 🔍 1. SEARCH ENDPOINT
// -------------------------------------------------------------
app.get('/api/search', (req, res) => {
    const searchQuery = req.query.url || req.query.q;
    if (!searchQuery) {
        return res.status(400).json({ status: "error", message: "Search query required" });
    }

    const command = `yt-dlp --cookies "${COOKIES_PATH}" --extractor-args "${EXTRACTOR_ARGS}" "ytsearch20:${searchQuery}" -j --flat-playlist`;

    exec(command, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ status: "error", message: "Search failed", details: stderr });
        }

        try {
            const lines = stdout.trim().split('\n').filter(line => line.trim() !== '');
            const results = [];

            lines.forEach(line => {
                const item = JSON.parse(line);
                
                let durationStr = "0:00";
                if (item.duration) {
                    const dur = Math.floor(item.duration);
                    const mins = Math.floor(dur / 60);
                    const secs = dur % 60;
                    durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                }

                results.push({
                    title: item.title || "N/A",
                    channel: item.uploader || item.channel || "Unknown",
                    duration: durationStr,
                    imageUrl: item.thumbnails && item.thumbnails.length > 0 
                        ? item.thumbnails[item.thumbnails.length - 1].url 
                        : `https://i.ytimg.com/vi/${item.id}/hq720.jpg`,
                    link: `https://youtube.com/watch?v=${item.id}`
                });
            });

            res.json({
                status: "success",
                creator: "ansadser",
                total: results.length,
                result: results,
                server: "servr-a"
            });
        } catch (e) {
            res.status(500).json({ status: "error", message: "Parsing failed", details: e.message });
        }
    });
});

// -------------------------------------------------------------
// 🟢 2. INFO ENDPOINT
// -------------------------------------------------------------
app.get('/api/info', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ status: false, message: "URL required" });

    const command = `yt-dlp --cookies "${COOKIES_PATH}" --extractor-args "${EXTRACTOR_ARGS}" -j "${videoUrl}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 15 }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ status: false, error: "Fetch failed", details: stderr });

        try {
            const data = JSON.parse(stdout);
            const downloads = [];

            if (data.formats) {
                const videoFormats = data.formats
                    .filter(f => f.vcodec !== 'none' && f.height)
                    .sort((a, b) => b.height - a.height);

                const seenHeights = new Set();
                for (const f of videoFormats) {
                    const qualityName = `${f.height}p`;
                    if (!seenHeights.has(qualityName)) {
                        seenHeights.add(qualityName);
                        downloads.push({
                            quality: qualityName,
                            format: f.ext || "mp4",
                            url: f.url
                        });
                    }
                }
            }

            const bestAudio = data.formats.find(f => f.vcodec === 'none' && f.acodec !== 'none');
            if (bestAudio) {
                downloads.push({
                    quality: "Audio (128kbps)",
                    format: "mp3",
                    url: bestAudio.url
                });
            }

            res.json({
                status: true,
                result: {
                    title: data.title,
                    videoId: data.id,
                    duration: data.duration,
                    thumbnail: data.thumbnail,
                    cached: true,
                    downloads: downloads
                }
            });
        } catch (e) {
            res.status(500).json({ status: false, error: "Parsing Error", details: e.message });
        }
    });
});

// -------------------------------------------------------------
// 🟡 3. VIDEO DOWNLOAD ENDPOINT
// -------------------------------------------------------------
app.get('/api/download', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ status: "error", message: "URL required" });

    const command = `yt-dlp --cookies "${COOKIES_PATH}" --extractor-args "${EXTRACTOR_ARGS}" -g -f "best[ext=mp4]/best" "${videoUrl}"`;

    exec(command, (error, stdout) => {
        if (error) return res.status(500).json({ status: "error", message: "Download link fetch failed" });

        res.json({
            status: "success",
            download: stdout.trim().split('\n')[0],
            creator: "ansadser"
        });
    });
});

// -------------------------------------------------------------
// 🔵 4. AUDIO DOWNLOAD ENDPOINT
// -------------------------------------------------------------
app.get('/api/audio', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ status: "error", message: "URL required" });

    const command = `yt-dlp --cookies "${COOKIES_PATH}" --extractor-args "${EXTRACTOR_ARGS}" -g -f "bestaudio/best" "${videoUrl}"`;

    exec(command, (error, stdout) => {
        if (error) return res.status(500).json({ status: "error", message: "Audio link fetch failed" });

        res.json({
            status: "success",
            Audio_url: stdout.trim().split('\n')[0],
            creator: "ansadser"
        });
    });
});

// PORT Handling (Koyeb uses PORT env or 8000/8080)
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
