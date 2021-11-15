# api_config.py

from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd

from payanam_launch import app
import commonfuncs as cf
import dbconnect


##########

class loadconfig_payload(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None

@app.post("/API/loadConfig") 
def loadconfig(req: loadconfig_payload):
    cf.logmessage("loadConfig api call")
    s1 = f"select config_key, config_value from config"
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    if len(df):
        returnD['config'] = df.to_dict(orient='records') 
    else:
        returnD['config'] = []
    
    return returnD
