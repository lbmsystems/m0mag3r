#!/usr/bin/env python3
"""
Rebuild index.html from src/app.jsx.

index.html is a self-unpacking bundle: a loader plus a base64+gzip asset manifest
and a JSON-encoded copy of the real document. The application source is one asset
in that manifest (type text/babel), compiled in the browser by Babel standalone.

This script swaps that one asset for the current contents of src/app.jsx and
leaves everything else — fonts, images, React, the template — byte-identical.

Usage:  python3 build.py [--check]
        --check  verify index.html already matches src/app.jsx; exit 1 if not
"""
import base64
import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"
APP_SRC = ROOT / "src" / "app.jsx"

# The manifest uuid of the text/babel application asset.
APP_UUID = "b6ce29f1-b49f-44f1-990f-a0ecc97b4eaf"
MANIFEST_RE = re.compile(
    r'(<script type="__bundler/manifest">)(.*?)(</script>)', re.S
)


def load_manifest(html):
    m = MANIFEST_RE.search(html)
    if not m:
        sys.exit("error: no __bundler/manifest block found in index.html")
    return m, json.loads(m.group(2))


def current_app_source(html):
    _, manifest = load_manifest(html)
    entry = manifest[APP_UUID]
    raw = base64.b64decode(entry["data"])
    return gzip.decompress(raw) if entry.get("compressed") else raw


def main():
    check_only = "--check" in sys.argv
    html = INDEX.read_text(encoding="utf-8")
    new_source = APP_SRC.read_bytes()

    if check_only:
        if current_app_source(html) == new_source:
            print("ok: index.html matches src/app.jsx")
            return 0
        print("stale: index.html does not match src/app.jsx — run python3 build.py")
        return 1

    m, manifest = load_manifest(html)
    entry = manifest[APP_UUID]
    if not entry.get("compressed"):
        sys.exit(f"error: asset {APP_UUID} is not gzipped; bundle format changed")

    # mtime=0 keeps the output deterministic across rebuilds.
    entry["data"] = base64.b64encode(
        gzip.compress(new_source, compresslevel=9, mtime=0)
    ).decode("ascii")

    rebuilt = (
        html[: m.start(2)]
        + json.dumps(manifest, separators=(",", ":"))
        + html[m.end(2) :]
    )

    # Round-trip guard: the bundle we just wrote must decode back to src/app.jsx.
    if current_app_source(rebuilt) != new_source:
        sys.exit("error: round-trip verification failed; index.html not written")

    INDEX.write_text(rebuilt, encoding="utf-8")
    print(f"built index.html ({len(new_source):,} bytes of app source, "
          f"{len(rebuilt):,} bytes total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
