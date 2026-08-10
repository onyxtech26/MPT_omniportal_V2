"""Test environment defaults.

Set before `main` is imported so a developer's local backend/.env cannot change
what the suite exercises: tests run against the file backend with no network,
and the assistant is treated as unconfigured unless a test says otherwise.
`load_dotenv` never overrides variables that are already set, so these win.
"""
import os

os.environ.setdefault("DATA_SOURCE", "file")
os.environ["DATA_SOURCE"] = "file"
os.environ.pop("NVIDIA_API_KEY", None)
