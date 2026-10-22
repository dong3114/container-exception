"""python -m cera_ai — runs the AI Server (uvicorn). Port: CERA_AI_PORT (default 8100). Binds to 127.0.0.1 by default:
the server is called by the Main Backend only, never by browsers. Settings are validated first (cera_ai/config.py)."""

import logging
import os
import sys

import uvicorn

from .app import create_app
from .config import SettingsError, load_settings

if __name__ == "__main__":
    logging.basicConfig(level=os.environ.get("CERA_AI_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        settings = load_settings(os.environ)
    except SettingsError as error:  # key names and reasons only — never values
        logging.getLogger("cera_ai").error("%s", error)
        sys.exit(78)
    uvicorn.run(create_app(), host=settings.host, port=settings.port, log_level="warning")
