import atexit
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import uvicorn


BACKEND_DIR = Path(__file__).resolve().parent
SRC_DIR = BACKEND_DIR.parent
PROJECT_ROOT = SRC_DIR.parent
ACCOUNTING_PORT = 8080
APP_PORT = int(os.getenv("API_PORT", "8000"))


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def start_accounting_api() -> subprocess.Popen | None:
    if is_port_open("127.0.0.1", ACCOUNTING_PORT):
        print(f"Accounting API already running on http://localhost:{ACCOUNTING_PORT}")
        return None

    process = subprocess.Popen(
        [sys.executable, str(BACKEND_DIR / "accounting_api.py")],
        cwd=BACKEND_DIR,
    )
    for _ in range(20):
        if is_port_open("127.0.0.1", ACCOUNTING_PORT):
            break
        time.sleep(0.25)
    print(f"Started accounting API on http://localhost:{ACCOUNTING_PORT}")
    return process


def main() -> None:
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    accounting_process = start_accounting_api()

    if accounting_process is not None:
        atexit.register(accounting_process.terminate)

    print(f"Starting Invoice Agent API on http://127.0.0.1:{APP_PORT}")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=APP_PORT,
        reload=False,
        app_dir=str(BACKEND_DIR),
    )


if __name__ == "__main__":
    main()
