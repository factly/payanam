from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # https://fastapi.tiangolo.com/tutorial/cors/
from fastapi.staticfiles import StaticFiles # static html files deploying
from brotli_asgi import BrotliMiddleware # https://github.com/fullonic/brotli-asgi

app = FastAPI()

# allow cors - from https://fastapi.tiangolo.com/tutorial/cors/
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# enable Brotli compression. Better for json payloads, supported by most browsers. Fallback to gzip by default. from https://github.com/fullonic/brotli-asgi
app.add_middleware(BrotliMiddleware)

# can add modules having api calls below

# import api_sample
import api_stops
import api_routes
import api_patterns
import api_config
import api_gtfs
import api_timings
import api_matching

app.mount("/gtfs", StaticFiles(directory="output", html = False), name="gtfs")
# Note: "/gtfs" mount needs to be above the / mount, else latter overrides.

app.mount("/", StaticFiles(directory="html", html = True), name="static")
# https://fastapi.tiangolo.com/tutorial/static-files/
# html=True is needed for defaulting to index.html. From https://stackoverflow.com/a/63805506/4355695


