
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd

from payanam_launch import app
import commonfuncs as cf
import dbconnect

##########

class loadpatterns_payload(BaseModel):
    route_id: str
    pattern_name: Optional[str] = None
    stopsFlag: Optional[bool] = None
    locationsFlag: Optional[bool] = None

@app.post("/API/loadpatterns")
def loadpatterns(req: loadpatterns_payload):
    cf.logmessage("loadpatterns api call")
    route_id = req.route_id

    s1 = f"select * from patterns where route_id = '{route_id}'"
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    if len(df):
        returnD['patterns'] = df.to_dict(orient='records') 
    else:
        returnD['patterns'] = []
    
    return returnD

#############
class updatePatternsOrder_payload(BaseModel):
    sequence: List[str]

@app.post("/API/updatePatternsOrder")
def updatePatternsOrder(req: updatePatternsOrder_payload):
    cf.logmessage("updatePatternsOrder api call")
    