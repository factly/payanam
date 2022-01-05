# api_config.py

from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd
import os

from payanam_launch import app
import commonfuncs as cf
import dbconnect


##########

class loadConfig_payload(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None

@app.post("/API/loadConfig", tags=["config"]) 
def loadconfig(req: loadConfig_payload):
    cf.logmessage("loadConfig api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    s1 = f"""select config_key, config_value from config
    where space_id = {space_id}"""
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    if len(df):
        returnD['config'] = df.to_dict(orient='records') 
    else:
        returnD['config'] = []
    
    return returnD


class saveConfig_payload(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None

@app.post("/API/saveConfig", tags=["config"]) 
def saveConfig(req: saveConfig_payload):
    cf.logmessage("saveConfig api call")
