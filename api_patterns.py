
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd
import os

from payanam_launch import app
import commonfuncs as cf
import dbconnect
from api_timings import updateTimingsForPattern


space_id = int(os.environ.get('SPACE_ID',1))

##########

class loadpatterns_payload(BaseModel):
    route_id: str
    pattern_name: Optional[str] = None
    stopsFlag: Optional[bool] = None
    locationsFlag: Optional[bool] = None

@app.post("/API/loadpatterns", tags=["patterns"])
def loadpatterns(req: loadpatterns_payload):
    cf.logmessage("loadpatterns api call")
    route_id = req.route_id
    space_id = int(os.environ.get('SPACE_ID',1))

    s1 = f"""select * from patterns 
    where space_id = {space_id}
    and route_id = '{route_id}'"""
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

@app.post("/API/updatePatternsOrder", tags=["patterns"])
def updatePatternsOrder(req: updatePatternsOrder_payload):
    cf.logmessage("updatePatternsOrder api call")
    space_id = int(os.environ.get('SPACE_ID',1))
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

@app.post("/API/deletePatterns", tags=["patterns"])
def deletePatterns(req: deletePatterns_payload):
    cf.logmessage("deletePatterns api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    patternsSQL = cf.quoteNcomma(req.patterns)
    d1 = f"delete from pattern_stops where space_id={space_id} and pattern_id in ({patternsSQL})"
    d2 = f"delete from patterns where space_id={space_id} and id in ({patternsSQL})"
    
    d1Count = dbconnect.execSQL(d1)
    d2Count = dbconnect.execSQL(d2)

    # also trips and timings under the pattern
    d3 = f"delete from stop_times where space_id={space_id} and trip_id in (select id from trips where pattern_id in ({patternsSQL}) )"
    d4 = f"delete from trips where where space_id={space_id} and pattern_id in ({patternsSQL})"
    d3Count = dbconnect.execSQL(d3)
    d4Count = dbconnect.execSQL(d4)
    
    returnD = { 'message': "success", "pattern_stops_deleted": d1Count, "patterns_deleted": d2Count,
        "trips_deleted": d4Count, "stop_times_deleted": d4Count }
    cf.logmessage(returnD)
    return returnD


############

class addPattern_payload(BaseModel):
    route_id: str
    name: str

@app.post("/API/addPattern", tags=["patterns"])
def addPattern(req: addPattern_payload):
    cf.logmessage("addPattern api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    # check if already existing
    s1 = f"""select name from patterns 
    where space_id = {space_id}
    and route_id='{req.route_id}' order by sequence"""
    existingPatterns = dbconnect.makeQuery(s1, output='column')
    if req.name in existingPatterns:
        raise HTTPException(status_code=400, detail="Pattern already exists")

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

@app.post("/API/editPattern", tags=["patterns"])
def editPattern(req: editPattern_payload):
    cf.logmessage("editPattern api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    # find if existing
    s1 = f"""select * from patterns
    where space_id = {space_id}
    and id='{req.pattern_id}'
    """
    existingPattern = dbconnect.makeQuery(s1, output='oneJson')
    if not len(existingPattern):
        raise HTTPException(status_code=400, detail="Could not remove existing sequence")

    s2 = f"""select * from pattern_stops 
    where space_id = {space_id}
    and pattern_id='{req.pattern_id}'
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

    # update timings entries if the length of the pattern has changed
    if len(existingPatternStops) != len(df):
        returnD['numTrips'], returnD['timings_added'], returnD['timings_removed'] = updateTimingsForPattern(req.pattern_id, len(df))
    
    cf.logmessage(returnD)
    return returnD


############

class loadPattern_payload(BaseModel):
    pattern_id: str

@app.post("/API/loadPattern", tags=["patterns"])
def loadPattern(req: loadPattern_payload):
    cf.logmessage("loadPattern api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { "message": "success"}

    # note: currently, frontend isn't using the lat-longs here, can make it use them later.
    s1 = f"""select t1.*, t2.name, 
    ST_Y(t2.geopoint::geometry) as latitude, ST_X(t2.geopoint::geometry) as longitude
    from pattern_stops as t1 
    left join stops_master as t2 
    on t1.stop_id = t2.id 
    where t1.space_id = {space_id}
    and t1.pattern_id = '{req.pattern_id}'
    order by t1.stop_sequence
    """
    df1 = dbconnect.makeQuery(s1, output='df')
    returnD['pattern_id'] = req.pattern_id
    returnD['pattern_stops'] = []
    returnD['id_stopId_lookup'] = {}
    
    if len(df1):
        returnD['pattern_stops'] = df1.to_dict(orient='records')

        # id to stop_id lookup
        for row in returnD['pattern_stops']:
            returnD['id_stopId_lookup'][row['id']] = row['stop_id']
        

    return returnD



