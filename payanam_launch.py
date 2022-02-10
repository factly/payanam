from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # https://fastapi.tiangolo.com/tutorial/cors/
from fastapi.staticfiles import StaticFiles # static html files deploying
from fastapi.middleware.gzip import GZipMiddleware # https://fastapi.tiangolo.com/advanced/middleware/

app = FastAPI()

# allow cors - from https://fastapi.tiangolo.com/tutorial/cors/
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# enable gzip compression, from https://fastapi.tiangolo.com/advanced/middleware/
app.add_middleware(GZipMiddleware, minimum_size=1000)

# can add modules having api calls below

# import api_sample
import api_stops
import api_routes
import api_patterns
import api_config
import api_gtfs
import api_timings
import api_matching

app.mount("/", StaticFiles(directory="html", html = True), name="static")
# https://fastapi.tiangolo.com/tutorial/static-files/
# html=True is needed for defaulting to index.html. From https://stackoverflow.com/a/63805506/4355695

