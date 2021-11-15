# api_routes.py

from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd

from payanam_launch import app
import commonfuncs as cf
import dbconnect


##########

class loadRoutes_payload(BaseModel):
    name: Optional[str] = None

@app.post("/API/loadRoutes")
def loadRoutes(req: loadRoutes_payload):
    cf.logmessage("loadRoutes api call")
    s1 = f"select * from routes"
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    if len(df):
        returnD['routes'] = df.to_dict(orient='records') 
    else:
        returnD['routes'] = []
    
    return returnD

