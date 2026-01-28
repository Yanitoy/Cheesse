import feather from 'feather-icons';
import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const pieceSymbols = {
  w: {
    p: '♙',
    n: '♘',
    b: '♗',
    r: '♖',
    q: '♕',
    k: '♔'
  },
  b: {
    p: '♟',
    n: '♞',
    b: '♝',
    r: '♜',
    q: '♛',
    k: '♚'
  }
};

const engineLevels = {
  mild: { label: 'Mild', movetime: 400 },
  medium: { label: 'Medium', movetime: 900 },
  aged: { label: 'Aged', movetime: 1400 }
};

function getPieceLabel(piece) {
  if (!piece) {
    return '';
  }

  return pieceSymbols[piece.color]?.[piece.type] || '?';
}

function parseUciMove(uci) {
  if (!uci || uci === '(none)' || uci.length < 4) {
    return null;
  }

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined
  };
}

function buildMoveLines(history) {
  const lines = [];

  for (let i = 0; i < history.length; i += 2) {
    const turn = Math.floor(i / 2) + 1;
    const whiteMove = history[i] || '';
    const blackMove = history[i + 1] || '';
    const line = blackMove ? `${turn}. ${whiteMove} ${blackMove}` : `${turn}. ${whiteMove}`;
    lines.push(line.trim());
  }

  return lines;
}

function getStatus(game) {
  if (game.isCheckmate()) {
    return `Checkmate. ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
  }

  if (game.isStalemate()) {
    return 'Draw by stalemate.';
  }

  if (game.isThreefoldRepetition()) {
    return 'Draw by repetition.';
  }

  if (game.isInsufficientMaterial()) {
    return 'Draw by insufficient material.';
  }

  if (game.isDraw()) {
    return 'Draw.';
  }

  if (game.isCheck()) {
    return `${game.turn() === 'w' ? 'White' : 'Black'} is in check.`;
  }

  return `${game.turn() === 'w' ? 'White' : 'Black'} to move.`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(seconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function formatEvaluation(evaluation) {
  if (!evaluation) {
    return 'Awaiting analysis';
  }

  if (evaluation.type === 'mate') {
    return `Mate ${evaluation.value > 0 ? 'in' : 'for'} ${Math.abs(evaluation.value)}`;
  }

  return `Eval ${evaluation.display}`;
}

function Icon({ name, className }) {
  const icon = feather.icons[name];

  if (!icon) {
    return null;
  }

  return (
    <span
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.toSvg({ 'stroke-width': 2 }) }}
    />
  );
}

export default function App() {
  const gameRef = useRef(new Chess());
  const audioContextRef = useRef(null);
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState(() => buildMoveLines(gameRef.current.history()));
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [currentPlayer, setCurrentPlayer] = useState(gameRef.current.turn() === 'w' ? 'white' : 'black');
  const [status, setStatus] = useState(getStatus(gameRef.current));
  const [timerRunning, setTimerRunning] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [engineStatus, setEngineStatus] = useState({
    available: false,
    enginePath: null,
    downloadUrl: null
  });
  const [engineLevel, setEngineLevel] = useState('medium');
  const [engineBusy, setEngineBusy] = useState(false);
  const [engineResult, setEngineResult] = useState(null);
  const [engineError, setEngineError] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.6);
  const [playVsBot, setPlayVsBot] = useState(false);
  const [botSide, setBotSide] = useState('black');
  const [botThinking, setBotThinking] = useState(false);

  const botColor = botSide === 'white' ? 'w' : 'b';
  const playerColor = botSide === 'white' ? 'b' : 'w';
  const playerSide = botSide === 'white' ? 'black' : 'white';
  const playerSideLabel = `${playerSide.charAt(0).toUpperCase()}${playerSide.slice(1)}`;
  const botName = 'RindBot';
  const whiteLabel = playVsBot ? (botSide === 'white' ? botName : 'You') : 'White';
  const blackLabel = playVsBot ? (botSide === 'white' ? 'You' : botName) : 'Black';
  const whiteMeta = playVsBot ? (botSide === 'white' ? 'Engine' : 'Human') : 'Online';
  const blackMeta = playVsBot ? (botSide === 'white' ? 'Human' : 'Engine') : 'Online';
  const currentLabel = currentPlayer === 'white' ? whiteLabel : blackLabel;
  const isBotTurn = playVsBot && gameRef.current.turn() === botColor;
  const isPlayerTurn = !playVsBot || gameRef.current.turn() === playerColor;
  const displayStatus = playVsBot
    ? status.replace(/White/g, whiteLabel).replace(/Black/g, blackLabel)
    : status;
  const statusText = isBotTurn && botThinking ? `${botName} is thinking...` : displayStatus;
  const turnLabel = isBotTurn && botThinking ? `${botName} thinking...` : `${currentLabel} to move`;
  const botHint = !engineStatus.available
    ? `Install Stockfish to play against ${botName}.`
    : playVsBot
    ? `You are playing ${playerSideLabel}.`
    : `Enable ${botName} to play a match.`;

  const getAudioContext = () => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return null;
    }

    audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  };

  const playTone = (frequency, duration = 0.08, type = 'triangle') => {
    if (!soundEnabled) {
      return;
    }

    const volume = Math.max(0, Math.min(soundVolume, 1));
    if (volume === 0) {
      return;
    }

    const context = getAudioContext();
    if (!context) {
      return;
    }

    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const targetVolume = volume * 0.2;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetVolume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  const playMoveSound = (move) => {
    if (!move) {
      return;
    }

    const isCapture = Boolean(move.captured) || move.flags?.includes('c') || move.flags?.includes('e');
    const isCheck = gameRef.current.isCheck();

    if (isCheck) {
      playTone(720, 0.12, 'triangle');
      return;
    }

    if (isCapture) {
      playTone(260, 0.1, 'square');
      return;
    }

    playTone(440, 0.07, 'triangle');
  };

  const board = useMemo(() => {
    const grid = [];
    const boardState = gameRef.current.board();

    for (let rankIndex = 0; rankIndex < boardState.length; rankIndex += 1) {
      for (let fileIndex = 0; fileIndex < boardState[rankIndex].length; fileIndex += 1) {
        const file = files[fileIndex];
        const rank = 8 - rankIndex;

        grid.push({
          id: `${file}${rank}`,
          file,
          rank,
          fileIndex,
          piece: boardState[rankIndex][fileIndex]
        });
      }
    }

    return grid;
  }, [fen]);

  useEffect(() => {
    fetch('/api/engine/status')
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data) => {
        setEngineStatus({
          available: Boolean(data.available),
          enginePath: data.enginePath || null,
          downloadUrl: data.downloadUrl || null
        });
      })
      .catch(() => {
        setEngineStatus({ available: false, enginePath: null, downloadUrl: null });
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const resumeAudio = () => {
      const context = getAudioContext();
      if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', resumeAudio);
    window.addEventListener('keydown', resumeAudio);

    return () => {
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  useEffect(() => {
    if (!timerRunning) return undefined;

    const interval = setInterval(() => {
      setWhiteTime((prev) => (currentPlayer === 'white' ? Math.max(prev - 1, 0) : prev));
      setBlackTime((prev) => (currentPlayer === 'black' ? Math.max(prev - 1, 0) : prev));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPlayer, timerRunning]);

  useEffect(() => {
    if (!timerRunning) return;

    if (whiteTime <= 0 || blackTime <= 0) {
      setTimerRunning(false);
      setStatus(currentPlayer === 'white' ? 'Black wins on time!' : 'White wins on time!');
    }
  }, [whiteTime, blackTime, currentPlayer, timerRunning]);

  useEffect(() => {
    if (!playVsBot || !engineStatus.available) {
      return undefined;
    }

    const game = gameRef.current;

    if (game.isGameOver() || botThinking || game.turn() !== botColor) {
      return undefined;
    }

    let cancelled = false;

    const requestMove = async () => {
      setBotThinking(true);
      setEngineError(null);

      try {
        const response = await fetch('/api/engine/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fen: game.fen(),
            movetime: engineLevels[engineLevel]?.movetime || 900
          })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Engine analysis failed.');
        }

        const payload = await response.json();
        const parsedMove = parseUciMove(payload.bestmove);

        if (!parsedMove) {
          return;
        }

        const appliedMove = game.move({
          from: parsedMove.from,
          to: parsedMove.to,
          promotion: parsedMove.promotion || 'q'
        });

        if (!appliedMove) {
          throw new Error('Stockfish returned an illegal move.');
        }

        updateGameState({ move: appliedMove });
      } catch (error) {
        if (!cancelled) {
          setEngineError(error.message);
        }
      } finally {
        setBotThinking(false);
      }
    };

    requestMove();

    return () => {
      cancelled = true;
    };
  }, [fen, playVsBot, botSide, engineLevel, engineStatus.available]);

  const updateGameState = ({ move, resetLastMove = false } = {}) => {
    const game = gameRef.current;
    setFen(game.fen());
    setMoves(buildMoveLines(game.history()));
    setCurrentPlayer(game.turn() === 'w' ? 'white' : 'black');
    setStatus(getStatus(game));
    setSelectedSquare(null);
    setLegalMoves([]);

    if (move) {
      setLastMove({ from: move.from, to: move.to });
      setEngineResult(null);
      setEngineError(null);
      playMoveSound(move);
    } else if (resetLastMove) {
      setLastMove(null);
    }

    if (game.isGameOver()) {
      setTimerRunning(false);
    }
  };

  const getLegalMoves = (square) =>
    gameRef.current.moves({ square, verbose: true }).map((move) => move.to);

  const clearSelection = () => {
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const attemptMove = (from, to) => {
    const move = gameRef.current.move({ from, to, promotion: 'q' });

    if (move) {
      updateGameState({ move });
      return true;
    }

    return false;
  };

  const handleSquareClick = (square) => {
    if (playVsBot && (!isPlayerTurn || botThinking)) {
      clearSelection();
      return;
    }

    if (selectedSquare) {
      if (square.id === selectedSquare) {
        clearSelection();
        return;
      }

      if (attemptMove(selectedSquare, square.id)) {
        return;
      }
    }

    if (square.piece && square.piece.color === gameRef.current.turn()) {
      setSelectedSquare(square.id);
      setLegalMoves(getLegalMoves(square.id));
      return;
    }

    clearSelection();
  };

  const handleDragStart = (event, square) => {
    if (playVsBot && (!isPlayerTurn || botThinking)) {
      event.preventDefault();
      return;
    }

    if (!square.piece || square.piece.color !== gameRef.current.turn()) {
      event.preventDefault();
      return;
    }

    setDragSource(square.id);
    setSelectedSquare(square.id);
    setLegalMoves(getLegalMoves(square.id));
    event.dataTransfer.setData('text/plain', square.id);
  };

  const handleDrop = (event, squareId) => {
    event.preventDefault();

    if (playVsBot && (!isPlayerTurn || botThinking)) {
      clearSelection();
      setDragSource(null);
      return;
    }

    const fromSquare = dragSource || event.dataTransfer.getData('text/plain');

    if (!fromSquare) {
      clearSelection();
      return;
    }

    if (!attemptMove(fromSquare, squareId)) {
      clearSelection();
    }

    setDragSource(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
  };

  const handleNewGame = () => {
    gameRef.current.reset();
    setWhiteTime(600);
    setBlackTime(600);
    setTimerRunning(true);
    setBotThinking(false);
    setEngineResult(null);
    setEngineError(null);
    clearSelection();
    updateGameState({ resetLastMove: true });
  };

  const handleFlipBoard = () => {
    setFlipped((prev) => !prev);
  };

  const handleAnalyze = async () => {
    setEngineBusy(true);
    setEngineError(null);

    try {
      const response = await fetch('/api/engine/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen,
          movetime: engineLevels[engineLevel]?.movetime || 900
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Engine analysis failed.');
      }

      const payload = await response.json();
      setEngineResult(payload);
    } catch (error) {
      setEngineError(error.message);
    } finally {
      setEngineBusy(false);
    }
  };

  const handleEngineLevel = (level) => {
    setEngineLevel(level);
  };

  const handleSoundToggle = (event) => {
    setSoundEnabled(event.target.checked);
  };

  const handleSoundVolume = (event) => {
    const value = Number.parseFloat(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }
    setSoundVolume(value);
  };

  const handlePlayVsBotToggle = (event) => {
    const enabled = event.target.checked;
    setPlayVsBot(enabled);
    setBotThinking(false);
    setEngineError(null);
    clearSelection();

    if (enabled) {
      setFlipped(botSide === 'white');
    }
  };

  const handleBotSide = (side) => {
    setBotSide(side);
    setBotThinking(false);
    setEngineError(null);
    clearSelection();
    setFlipped(side === 'white');
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="site-container topbar__inner">
          <div className="brand">
            <div className="brand__logo">
              <Icon name="grid" className="icon" />
            </div>
            <div className="brand__text">
              <div className="brand__title">Cheesse</div>
              <div className="brand__tagline">Play, savor, improve.</div>
            </div>
          </div>
          <nav className="topnav">
            <button className="topnav__link" type="button">
              Play
            </button>
            <button className="topnav__link" type="button">
              Puzzles
            </button>
            <button className="topnav__link" type="button">
              Learn
            </button>
            <button className="topnav__link" type="button">
              Watch
            </button>
          </nav>
          <div className="topbar__actions">
            <button className="button button--ghost" type="button">
              Create game
            </button>
          </div>
        </div>
      </header>

      <main className="site-container main-grid">
        <section className="board-panel reveal" style={{ '--delay': '0s' }}>
          <div className="board-header">
            <div>
              <h1 className="board-title">Cheeseboard Arena</h1>
              <p className="board-subtitle">Rapid 10+0 with creamy tactics.</p>
            </div>
            <div id="game-status" className="board-status">
              {statusText}
            </div>
          </div>

          <div className="board-frame">
            <div
              id="chessboard"
              className={`board-grid${flipped ? ' flipped' : ''}`}
            >
              {board.map((square) => {
                const isLight = (square.rank + square.fileIndex) % 2 === 0;
                const isSelected = selectedSquare === square.id;
                const isLegal = legalMoves.includes(square.id);
                const isLast = lastMove && (square.id === lastMove.from || square.id === lastMove.to);
                const pieceLabel = getPieceLabel(square.piece);

                const squareClassName = [
                  isLight ? 'light-square' : 'dark-square',
                  isSelected ? 'highlight' : '',
                  isLast ? 'last-move' : ''
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div
                    key={square.id}
                    id={square.id}
                    data-file={square.file}
                    data-rank={square.rank}
                    className={squareClassName}
                    onClick={() => handleSquareClick(square)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, square.id)}
                  >
                    {isLegal && !square.piece && <span className="possible-move" />}
                    {isLegal && square.piece && <span className="capture-move" />}
                    {square.piece && (
                      <div
                        className="piece"
                        data-piece={square.piece.color + square.piece.type}
                        draggable={
                          square.piece.color === gameRef.current.turn() && isPlayerTurn && !botThinking
                        }
                        onDragStart={(event) => handleDragStart(event, square)}
                        onDragEnd={handleDragEnd}
                      >
                        {pieceLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="board-controls">
            <div className="board-buttons">
              <button className="button button--primary" type="button" onClick={handleNewGame}>
                <Icon name="refresh-cw" className="icon" />
                New game
              </button>
              <button className="button button--ghost" type="button" onClick={handleFlipBoard}>
                <Icon name="rotate-cw" className="icon" />
                Flip board
              </button>
            </div>
            <div className="board-meta">
              <div className="board-meta__item">
                <Icon name="activity" className="icon" />
                <span>{moves.length} moves</span>
              </div>
              <div className="board-meta__item">
                <Icon name="user" className="icon" />
                <span>{turnLabel}</span>
              </div>
            </div>
            <div className="sound-controls">
              <label className="sound-toggle">
                <input type="checkbox" checked={soundEnabled} onChange={handleSoundToggle} />
                <span>Sounds</span>
              </label>
              <div className="sound-slider">
                <Icon name={soundEnabled ? 'volume-2' : 'volume-x'} className="icon" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={handleSoundVolume}
                  disabled={!soundEnabled}
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="sidebar">
          <div className="card reveal" style={{ '--delay': '0.1s' }}>
            <div className="card__header">
              <div>
                <h2 className="card__title">Pairings</h2>
                <p className="card__subtitle">Aged rapid</p>
              </div>
              <span className="card__chip">Live</span>
            </div>
            <div className={`player-row${currentPlayer === 'white' ? ' is-active' : ''}`}>
              <div className="player-info">
                <div className="player-avatar player-avatar--light">W</div>
                <div>
                  <div className="player-name">{whiteLabel}</div>
                  <div className="player-meta">{whiteMeta}</div>
                </div>
              </div>
              <div id="white-time" className="player-timer">
                {formatTime(whiteTime)}
              </div>
            </div>
            <div className={`player-row${currentPlayer === 'black' ? ' is-active' : ''}`}>
              <div className="player-info">
                <div className="player-avatar player-avatar--dark">B</div>
                <div>
                  <div className="player-name">{blackLabel}</div>
                  <div className="player-meta">{blackMeta}</div>
                </div>
              </div>
              <div id="black-time" className="player-timer">
                {formatTime(blackTime)}
              </div>
            </div>
          </div>

          <div className="card card--analysis reveal" style={{ '--delay': '0.2s' }}>
            <div className="card__header">
              <div>
                <h2 className="card__title">RindBot Analysis</h2>
                <p className="card__subtitle">Stockfish 17.1</p>
              </div>
              <span className={`status-dot${engineStatus.available ? ' is-online' : ' is-offline'}`} />
            </div>
            <div className="analysis-grid">
              <div className="analysis-row">
                <span>Status</span>
                <strong>
                  {engineStatus.available
                    ? `Ready${engineStatus.enginePath ? ` (${engineStatus.enginePath})` : ''}`
                    : 'Not installed'}
                </strong>
              </div>
              <div className="analysis-row">
                <span>Best move</span>
                <strong>{engineResult?.bestmove || '—'}</strong>
              </div>
              <div className="analysis-row">
                <span>Evaluation</span>
                <strong>{formatEvaluation(engineResult?.evaluation)}</strong>
              </div>
              <div className="analysis-row">
                <span>Depth</span>
                <strong>{engineResult?.depth || '-'}</strong>
              </div>
            </div>
            <div className="bot-controls">
              <label className="bot-toggle">
                <input
                  type="checkbox"
                  checked={playVsBot}
                  onChange={handlePlayVsBotToggle}
                  disabled={!engineStatus.available}
                />
                <span>Play vs {botName}</span>
              </label>
              <div className="side-toggle">
                <button
                  className={`side-button${botSide === 'black' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => handleBotSide('black')}
                  disabled={!playVsBot || !engineStatus.available}
                >
                  Play White
                </button>
                <button
                  className={`side-button${botSide === 'white' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => handleBotSide('white')}
                  disabled={!playVsBot || !engineStatus.available}
                >
                  Play Black
                </button>
              </div>
              <div className="bot-hint">{botThinking ? `${botName} is thinking...` : botHint}</div>
            </div>
            {engineResult?.pv && <div className="analysis-pv">PV: {engineResult.pv}</div>}
            {engineError && <div className="analysis-error">{engineError}</div>}
            {!engineStatus.available && engineStatus.downloadUrl && (
              <a className="analysis-link" href={engineStatus.downloadUrl} rel="noreferrer" target="_blank">
                Download Stockfish engine
              </a>
            )}
            <button
              className="button button--primary button--full"
              type="button"
              onClick={handleAnalyze}
              disabled={!engineStatus.available || engineBusy || botThinking}
            >
              <Icon name="bar-chart-2" className="icon" />
              {engineBusy ? 'Analyzing...' : 'Analyze position'}
            </button>
            <div className="level-toggle">
              {Object.entries(engineLevels).map(([key, level]) => (
                <button
                  key={key}
                  className={`level-button${engineLevel === key ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => handleEngineLevel(key)}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card card--moves reveal" style={{ '--delay': '0.3s' }}>
            <div className="card__header">
              <div>
                <h2 className="card__title">Cheese Log</h2>
                <p className="card__subtitle">Slice list</p>
              </div>
              <span className="card__chip">{moves.length}</span>
            </div>
            <div id="move-history" className="moves-list">
              {moves.length === 0 ? (
                <div className="moves-muted">No moves yet.</div>
              ) : (
                moves.map((move) => <div key={move}>{move}</div>)
              )}
            </div>
          </div>
        </aside>
      </main>

      <footer className="footer">
        <div className="site-container footer__inner">
          <span>Cheesse</span>
          <span>Built for fast games and sharp slices.</span>
        </div>
      </footer>
    </div>
  );
}


