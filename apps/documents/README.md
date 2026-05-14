# documents

Python script invoked by the AI server (`POST /documents/generate`) to fill a
Mieterselbstauskunft PDF and append supporting attachments.

## Setup

### macOS / Linux

```bash
cd apps/documents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Or from the repo root: `npm run setup -w @repo/documents`.

Then point the server at this interpreter so it doesn't fall back to the system `python3`:

```bash
export DOCUMENTS_PYTHON_PATH="$(pwd)/.venv/bin/python3"
```

### Windows (PowerShell)

The `npm run setup` shortcut is POSIX-only — Windows users run these steps manually:

```powershell
cd apps/documents
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If activation is blocked, allow scripts for the current session once:
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`.

Point the server at this interpreter:

```powershell
$env:DOCUMENTS_PYTHON_PATH = "$PWD\.venv\Scripts\python.exe"
```

### Windows (cmd.exe)

```cmd
cd apps\documents
python -m venv .venv
.\.venv\Scripts\activate.bat
pip install -r requirements.txt
set DOCUMENTS_PYTHON_PATH=%CD%\.venv\Scripts\python.exe
```

### Or, on any platform, install via `pyproject.toml`

```bash
pip install -e .
```

## CLI usage

```bash
python3 fill_selbstauskunft.py --json '{"address":"...","name":"...", ...}' -o out.pdf
```

See `fill_selbstauskunft.py` for the full field list. `--no-attach` skips the
default `attachments/` PDF; `--attach <pdf> [<pdf> ...]` appends extras.
