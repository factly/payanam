
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd
import os

from payanam_launch import app
import commonfuncs as cf
import dbconnect

space_id = int(os.environ.get('SPACE_ID',1))

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


############

class addPattern_payload(BaseModel):
    route_id: str
    name: str

@app.post("/API/addPattern")
def addPattern(req: addPattern_payload):
    cf.logmessage("addPattern api call")

    # check if already existig
    s1 = f"select name from patterns where route_id='{req.route_id}' order by sequence"
    existingPatterns = dbconnect.makeQuery(s1, output='column')
    if req.name in existingPatterns:
        raise HTTPException(status_code=400, detail="Pattern already exists")

    global space_id
    returnD = { "message": "success" }

    pid1 = cf.makeUID()
    i1 = f"""insert into patterns (space_id, id, route_id, name, sequence, created_on)
    values ({space_id}, '{pid1}', '{req.route_id}', '{req.name}', {len(existingPatterns)+1} , CURRENT_TIMESTAMP)
    """
    pCount = dbconnect.execSQL(i1)
    if not pCount:
        raise HTTPException(status_code=400, detail="Error could not create Pattern")

    returnD['id'] = pid1
    return returnD


############

class editPattern_payload(BaseModel):
    pattern_id: str
    stops: List[str]

@app.post("/API/editPattern")
def editPattern(req: editPattern_payload):
    cf.logmessage("editPattern api call")

    # find if existing
    s1 = f"""select * from patterns
    where id='{req.pattern_id}'
    """
    existingPattern = dbconnect.makeQuery(s1, output='oneJson')
    if not len(existingPattern):
        raise HTTPException(status_code=400, detail="Could not remove existing sequence")

    s2 = f"""select * from pattern_stops 
    where pattern_id='{req.pattern_id}'
    order by stop_sequence
    """
    existingPatternStops = dbconnect.makeQuery(s2, output='df')

    # to do : validation of stop ids

    # delete existing pattern if any
    if len(existingPatternStops):
        print("existing:"); print(existingPatternStops)
        d1 = f"""delete from pattern_stops
        where pattern_id='{req.pattern_id}'
        """
        dCount = dbconnect.execSQL(d1)
        if not dCount:
            raise HTTPException(status_code=400, detail="Could not remove existing sequence")
    else:
        cf.logmessage("This pattern didn't have stops earlier.")

    # new pattern
    df = pd.DataFrame({'stop_id':req.stops})
    df['id'] = cf.assignUID(df)
    df['stop_sequence'] = list(range(1,len(df)+1))
    print("new:"); print(df)
    
    global space_id
    df['space_id'] = space_id
    df['pattern_id'] = req.pattern_id
    
    status1 = dbconnect.addTable(df, table='pattern_stops')
    if not status1:
        raise HTTPException(status_code=400, detail="Could not add sequence")
    
    # also update pattern's entry
    u1 = f"""update patterns
    set last_updated=CURRENT_TIMESTAMP
    where id='{req.pattern_id}'
    """
    uCount = dbconnect.execSQL(u1)
    if not uCount:
        cf.logmessage("Warning: could not update the pattern's entry in patterns table, continuing")

    returnD = { "message": "success",
        "oldCount" : len(existingPatternStops),
        "newCount": len(df)
    }

    return returnD


############

class loadPattern_payload(BaseModel):
    pattern_id: str

@app.post("/API/loadPattern")
def loadPattern(req: loadPattern_payload):
    cf.logmessage("loadPattern api call")
    returnD = { "message": "success"}

    s1 = f"""select t1.*, t2.name, t2.latitude, t2.longitude from pattern_stops as t1 
    left join stops_master as t2 
    on t1.stop_id = t2.id 
    where t1.pattern_id = '{req.pattern_id}'
    """
    df1 = dbconnect.makeQuery(s1, output='df', keepCols=True)
    returnD['pattern_id'] = req.pattern_id
    returnD['pattern_stops'] = df1.to_dict(orient='records')

    return returnD
