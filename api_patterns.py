
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
    returnD = { 'message': "success"}

    # 2 sets of updates to avoid breaking the route + sequence constraint.
    # First, set the new sequences as negative numbers, which we know for sure aren't being taken up.
    for N, pid in enumerate(req.sequence):
        newSeq = -(N+1)
        u1 = f"update patterns set sequence={newSeq} where id='{pid}'"
        uCount = dbconnect.execSQL(u1)

    # After, populate actual new sequence numbers. All positive nums were cleared so are available.
    for N, pid in enumerate(req.sequence):
        newSeq = (N+1)
        u2 = f"update patterns set sequence={newSeq} where id='{pid}'"
        uCount = dbconnect.execSQL(u2)

    
    return returnD


############

class deletePatterns_payload(BaseModel):
    patterns: List[str]

@app.post("/API/deletePatterns")
def deletePatterns(req: deletePatterns_payload):
    cf.logmessage("deletePatterns api call")
    patternsSQL = cf.quoteNcomma(req.patterns)
    d1 = f"delete from pattern_stops where pattern_id in ({patternsSQL})"
    d2 = f"delete from patterns where id in ({patternsSQL})"
    
    d1Count = dbconnect.execSQL(d1)
    d2Count = dbconnect.execSQL(d2)
    returnD = { 'message': "success", "pattern_stops_deleted": d1Count, "patterns_deleted": d2Count }
    return returnD
