"""python -m cera_ai — runs the AI Server (uvicorn). Port: CERA_AI_PORT (default 8100). Binds to 127.0.0.1 by default:
the server is called by the Main Backend only, never by browsers."""

import logging
import os

import uvicorn

from .app import create_app

if __name__ == "__main__":
    logging.basicConfig(level=os.environ.get("CERA_AI_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    uvicorn.run(create_app(), host=os.environ.get("CERA_AI_HOST", "127.0.0.1"), port=int(os.environ.get("CERA_AI_PORT", "8100")), log_level="warning")
