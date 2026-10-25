"""柳本幸子 公式サイト — ローカル編集用サーバー

使い方:  python server.py
  閲覧用ページ  http://localhost:8000/
  本人用(編集)  http://localhost:8000/admin/

このPCの中だけで動きます(外部からはアクセスできません)。
標準ライブラリのみ使用。
"""
import base64
import json
import re
import sys
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
IMAGES = ROOT / "images"
PORT = 8000

# 保存を許可するデータファイル
DATA_FILES = {"posts": "posts.json", "events": "events.json", "profile": "profile.json"}
# 画像の保存先
IMAGE_DIRS = {"posts": "posts", "flyers": "flyers", "profile": "profile"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD = 20 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # 編集結果がすぐ反映されるようにキャッシュさせない
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_UPLOAD * 2:
            raise ValueError("ファイルが大きすぎます")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_POST(self):
        try:
            m = re.fullmatch(r"/api/save/(\w+)", self.path)
            if m and m.group(1) in DATA_FILES:
                payload = self._read_body()
                target = DATA / DATA_FILES[m.group(1)]
                tmp = target.with_suffix(".tmp")
                tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                tmp.replace(target)
                return self._json(200, {"ok": True})

            if self.path == "/api/upload":
                payload = self._read_body()
                kind = payload.get("kind")
                if kind not in IMAGE_DIRS:
                    return self._json(400, {"error": "不明な画像の種類です"})
                ext = Path(payload.get("filename", "")).suffix.lower()
                if ext not in IMAGE_EXT:
                    return self._json(400, {"error": "画像ファイル(jpg/png/gif/webp)を選んでください"})
                raw = base64.b64decode(payload["data"])
                if len(raw) > MAX_UPLOAD:
                    return self._json(400, {"error": "画像は20MBまでです"})
                folder = IMAGES / IMAGE_DIRS[kind]
                folder.mkdir(parents=True, exist_ok=True)
                name = time.strftime("%Y%m%d-%H%M%S") + f"-{int(time.time() * 1000) % 1000:03d}{ext}"
                (folder / name).write_bytes(raw)
                return self._json(200, {"ok": True, "path": f"images/{IMAGE_DIRS[kind]}/{name}"})

            return self._json(404, {"error": "not found"})
        except Exception as e:  # noqa: BLE001 — 画面にエラー内容を出すため
            return self._json(500, {"error": str(e)})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"閲覧用ページ: http://localhost:{PORT}/")
    print(f"本人用(編集): http://localhost:{PORT}/admin/")
    print("終了するときはこの画面を閉じてください。")
    if "--no-browser" not in sys.argv:
        webbrowser.open(f"http://localhost:{PORT}/admin/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
