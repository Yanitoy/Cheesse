const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_ENGINE_PATH = path.join(__dirname, 'bin', 'stockfish.exe');
const STOCKFISH_WINDOWS_URL =
    'https://github.com/official-stockfish/Stockfish/releases/download/sf_17.1/stockfish-windows-x86-64.zip';

function resolveEnginePath() {
    return process.env.STOCKFISH_PATH || DEFAULT_ENGINE_PATH;
}

function getEngineStatus() {
    const enginePath = resolveEnginePath();
    return {
        available: fs.existsSync(enginePath),
        enginePath,
        downloadUrl: STOCKFISH_WINDOWS_URL
    };
}

function parseScore(line) {
    const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (!scoreMatch) {
        return null;
    }

    const type = scoreMatch[1];
    const value = Number.parseInt(scoreMatch[2], 10);
    let display = '';

    if (type === 'cp') {
        const pawns = (value / 100).toFixed(2);
        display = `${value >= 0 ? '+' : ''}${pawns}`;
    } else {
        display = `M${value}`;
    }

    return { type, value, display };
}

function analyzePosition({ fen = 'startpos', moves = [], depth, movetime = 600 }) {
    return new Promise((resolve, reject) => {
        const { enginePath, available } = getEngineStatus();
        if (!available) {
            reject(new Error('Stockfish engine not found. Download it or set STOCKFISH_PATH.'));
            return;
        }

        const engine = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let resolved = false;
        let buffer = '';
        let latestScore = null;
        let latestDepth = null;
        let latestNodes = null;
        let latestPv = null;

        const timeoutMs = Math.max(250, Number(movetime) + 1500);
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                engine.kill();
                reject(new Error('Stockfish timed out.'));
            }
        }, timeoutMs);

        const cleanup = () => {
            clearTimeout(timeout);
            engine.stdout.removeAllListeners();
            engine.stderr.removeAllListeners();
        };

        const finish = (payload) => {
            if (resolved) {
                return;
            }
            resolved = true;
            cleanup();
            engine.kill();
            resolve(payload);
        };

        const handleLine = (line) => {
            if (!line) {
                return;
            }

            if (line === 'uciok') {
                engine.stdin.write('isready\n');
                return;
            }

            if (line === 'readyok') {
                const moveList = Array.isArray(moves) && moves.length > 0 ? ` moves ${moves.join(' ')}` : '';
                if (fen === 'startpos') {
                    engine.stdin.write(`position startpos${moveList}\n`);
                } else {
                    engine.stdin.write(`position fen ${fen}${moveList}\n`);
                }

                if (depth) {
                    engine.stdin.write(`go depth ${depth}\n`);
                } else {
                    engine.stdin.write(`go movetime ${movetime}\n`);
                }
                return;
            }

            if (line.startsWith('info')) {
                const score = parseScore(line);
                if (score) {
                    latestScore = score;
                }

                const depthMatch = line.match(/\bdepth\s+(\d+)/);
                if (depthMatch) {
                    latestDepth = Number.parseInt(depthMatch[1], 10);
                }

                const nodesMatch = line.match(/\bnodes\s+(\d+)/);
                if (nodesMatch) {
                    latestNodes = Number.parseInt(nodesMatch[1], 10);
                }

                const pvMatch = line.match(/\bpv\s+(.+)$/);
                if (pvMatch) {
                    latestPv = pvMatch[1];
                }

                return;
            }

            if (line.startsWith('bestmove')) {
                const match = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
                const bestmove = match ? match[1] : null;
                const ponder = match && match[2] ? match[2] : null;
                finish({
                    bestmove,
                    ponder,
                    evaluation: latestScore,
                    depth: latestDepth,
                    nodes: latestNodes,
                    pv: latestPv
                });
            }
        };

        engine.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            lines.forEach((line) => handleLine(line.trim()));
        });

        engine.stderr.on('data', (chunk) => {
            const message = chunk.toString().trim();
            if (!resolved && message) {
                resolved = true;
                cleanup();
                engine.kill();
                reject(new Error(message));
            }
        });

        engine.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(error);
            }
        });

        engine.stdin.write('uci\n');
    });
}

module.exports = {
    analyzePosition,
    getEngineStatus,
    resolveEnginePath
};
