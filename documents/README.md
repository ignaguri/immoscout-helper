# documents

Python script invoked by the AI server (`POST /documents/generate`) to fill a
Mieterselbstauskunft PDF and append supporting attachments.

## Setup

```bash
cd documents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then point the server at this interpreter so it doesn't fall back to the system `python3`:

```bash
export DOCUMENTS_PYTHON_PATH="$(pwd)/.venv/bin/python3"
```

Or, equivalently, install via `pyproject.toml`:

```bash
pip install -e .
```

## CLI usage

```bash
python3 fill_selbstauskunft.py --json '{"address":"...","name":"...", ...}' -o out.pdf
```

See `fill_selbstauskunft.py` for the full field list. `--no-attach` skips the
default `attachments/` PDF; `--attach <pdf> [<pdf> ...]` appends extras.
