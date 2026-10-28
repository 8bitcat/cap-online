"""Lokal utvecklingsserver med stöd för HTTP Range.

Pythons vanliga `http.server` saknar Range-stöd, och då kan webbläsaren inte
spola i mp4-filmerna (▶-knapparna per moment slutar fungera). Den här
servern svarar med 206 Partial Content på Range-förfrågningar.

    python tools/serve.py          # http://localhost:8808/
    python tools/serve.py 9000     # annan port
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        rng = self.headers.get("Range")
        if not rng or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        try:
            unit, spec = rng.strip().split("=")
            start_s, end_s = spec.split("-")
            start = int(start_s) if start_s else max(0, size - int(end_s))
            end = int(end_s) if end_s and start_s else size - 1
        except ValueError:
            return super().send_head()
        if unit != "bytes" or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self._range_left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_range_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(256 * 1024, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

    def end_headers(self):
        if not any(h.lower() == "accept-ranges" for h, _ in self._headers_buffer_names()):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def _headers_buffer_names(self):
        for raw in getattr(self, "_headers_buffer", []):
            try:
                line = raw.decode("latin-1")
            except Exception:
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                yield k, v

    def log_message(self, fmt, *args):
        if "/media/" in (args[0] if args else ""):
            return  # tysta filmhämtningarna
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8808
    handler = partial(RangeHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as srv:
        print(f"CAP på http://localhost:{port}/  (Ctrl+C avslutar)", flush=True)
        srv.serve_forever()


if __name__ == "__main__":
    main()
