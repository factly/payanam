# api_stops.py

import os
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd

from payanam_launch import app
import commonfuncs as cf
import dbconnect


###############

class loadStops_payload(BaseModel):
    criteria: Optional[str] = None
    data: List[str] = None


@app.post("/API/loadStops")
def loadStops(req: loadStops_payload):
    cf.logmessage("loadStops api call")
    s1 = f"select * from stops_master"
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    if len(df):
        returnD['stops'] = df.to_dict(orient='records') 
    else:
        returnD['stops'] = []
    
    return returnD


###############

class addStops_payload_single(BaseModel):
    name: str
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class addStops_payload(BaseModel):
    data: List[addStops_payload_single]

@app.post("/API/addStops")
def addStops(req: addStops_payload):
    cf.logmessage("addStops api call")

    # converting fastapi request data array to pandas dataframe, from https://stackoverflow.com/a/60845064/4355695
    df1 = pd.DataFrame([t.__dict__ for t in req.data ])

    # to do: validation: remove the bad ones
    
    # insert them
    df1['space_id'] = int(os.environ.get('SPACE_ID',1))
    df1['id'] = df1['name'].apply(lambda x: cf.makeUID())
    print(df1)

    timestamp = cf.getTime()
    df1['created_on'] = timestamp
    df1['created_by'] = '' # will bring in username later

    status = dbconnect.addTable(df1, 'stops_master')
    if status:
        returnD = { 'message': "success" }
        returnD['added'] = len(df1)
        return returnD
    else:
        raise HTTPException(status_code=400, detail="Could not insert data")

