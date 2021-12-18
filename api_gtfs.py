# api_gtfs.py

import os, time
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header, File, UploadFile
import pandas as pd
import zipfile, io

from payanam_launch import app
import commonfuncs as cf
import dbconnect


###############

# uploading files
# https://fastapi.tiangolo.com/tutorial/request-files/
# 

@app.post("/API/uploadGTFS", tags=["gtfs"])
def uploadGTFS(file1: UploadFile = File(...)):
    contents = file1.file.read()
    group_name = file1.filename.replace('.zip','')
    print(len(contents), group_name)
    with zipfile.ZipFile(io.BytesIO(contents)) as z:
        gtfsFiles = z.namelist()
        print(a)
        if 'agency.txt' in gtfsFiles:
            agencydf = pd.read_csv(io.BytesIO(z.read('agency.txt')))
        else:
            agencydf = None
        
        if 'routes.txt' in gtfsFiles:
            routedf = pd.read_csv(io.BytesIO(z.read('routes.txt')))
        else:
            routedf = None

        if 'trips.txt' in gtfsFiles:
            tripdf = pd.read_csv(io.BytesIO(z.read('trips.txt')))
        else:
            tripdf = None

        if 'stop_times.txt' in gtfsFiles:
            stop_timedf = pd.read_csv(io.BytesIO(z.read('stop_times.txt')))
        else:
            stop_timedf = None

        if 'stops.txt' in gtfsFiles:
            stopdf = pd.read_csv(io.BytesIO(z.read('stops.txt')))
        else:
            stopdf = None


    return {"filename": file1.filename, "name": group_name}