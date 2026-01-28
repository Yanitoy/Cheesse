# Stockfish Integration

This project uses the official Stockfish engine from `https://github.com/official-stockfish/Stockfish`.

To install the Windows engine binary locally, run:

```
powershell -ExecutionPolicy Bypass -File Backend/scripts/download-stockfish.ps1
```

You can also set the `STOCKFISH_PATH` environment variable to point to a different
Stockfish binary.

Licensing details are included in `Backend/stockfish/Copying.txt`, and contributors
are listed in `Backend/stockfish/AUTHORS`.
