const express = require('express');
const fs = require('fs');
const path = require('path');
const { analyzePosition, getEngineStatus } = require('./stockfish-engine');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json({ limit: '200kb' }));

const sampleMoves = [
    '1. e4 e5',
    '2. Nf3 Nc6',
    '3. Bb5 a6',
    '4. Ba4 Nf6',
    '5. O-O Be7',
    '6. Re1 b5',
    '7. Bb3 d6',
    '8. c3 O-O'
];

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.get('/api/moves', (_req, res) => {
    res.json({ moves: sampleMoves });
});

app.get('/api/engine/status', (_req, res) => {
    const status = getEngineStatus();
    res.json({
        available: status.available,
        enginePath: status.available ? path.basename(status.enginePath) : null,
        downloadUrl: status.downloadUrl
    });
});

app.post('/api/engine/analyze', async (req, res) => {
    try {
        const { fen, moves, depth, movetime } = req.body || {};
        const result = await analyzePosition({
            fen: typeof fen === 'string' && fen.trim() ? fen.trim() : 'startpos',
            moves: Array.isArray(moves) ? moves : [],
            depth: Number.isFinite(depth) ? depth : undefined,
            movetime: Number.isFinite(movetime) ? movetime : 600
        });
        res.json(result);
    } catch (error) {
        res.status(503).json({ error: error.message });
    }
});

const distPath = path.join(__dirname, '..', 'Frontend', 'dist');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(indexPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
        res.sendFile(indexPath);
    });
}

app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
});
