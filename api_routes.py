# api_routes.py

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

class loadRoutesList_payload(BaseModel):
    name: Optional[str] = None

@app.post("/API/loadRoutesList")
def loadRoutesList(req: loadRoutesList_payload):
    cf.logmessage("loadRoutes api call")
    s1 = f"select id, name, depot, route_group_id from routes"
    df = dbconnect.makeQuery(s1, output='df',keepCols=True)
    df.rename(columns={'name':'text'}, inplace=True)

    # TO DO: group by depots, route groups etc in this format: 
    # https://select2.org/data-sources/formats#grouped-data
    
    returnD = { 'message': "success"}
    returnD['results'] = df.to_dict(orient='records') 
    return returnD

    # if len(df):
    #     returnD['results'] = df.to_dict(orient='records') 
    # else:
    #     returnD['results'] = []
    
    # return returnD


##########

class addRoute_payload(BaseModel):
    name: str

@app.post("/API/addRoute")
def addRoute(req: addRoute_payload):
    cf.logmessage("addRoute api call")
    name = req.name
    print(name)
    # routeEntry = {
    #     'id': cf.makeUID(),
    #     'name': name,

    # }
    space_id = int(os.environ.get('SPACE_ID',1))
    route_id = cf.makeUID()
    i1 = f"""insert into routes (space_id, id, name, created_on )
    values ({space_id}, '{route_id}', '{name}', CURRENT_TIMESTAMP )
    """
    iCount = dbconnect.execSQL(i1)
    if not iCount:
        raise HTTPException(status_code=400, detail="Could not create route")
    
    # also create basic 2 patterns for the route: UP and DOWN
    pid1 = cf.makeUID()
    pid2 = cf.makeUID()
    i2 = f"""insert into patterns (space_id, id, route_id, name, sequence, created_on)
    values ({space_id}, '{pid1}', '{route_id}', 'UP', 1, CURRENT_TIMESTAMP),
    ({space_id}, '{pid2}', '{route_id}', 'DOWN', 2, CURRENT_TIMESTAMP)
    """
    iCount2 = dbconnect.execSQL(i2)
    if not iCount2:
        raise HTTPException(status_code=400, detail="Could not create patterns")

    returnD = { "message": "success",
        "id": route_id,
        "patterns": [pid1, pid2]
    }
    return returnD


class loadRouteDetails_payload(BaseModel):
    route_id: str


@app.post("/API/loadRouteDetails")
def loadRouteDetails(req: loadRouteDetails_payload):
    cf.logmessage("loadRouteDetails api call")
    route_id = req.route_id
    returnD = { "message": "success"}
    
    s1 = f"select * from routes where id='{route_id}'"
    returnD['route'] = dbconnect.makeQuery(s1, output='oneJson')
    if not returnD.get('route').get('name') :
        raise HTTPException(status_code=400, detail="Could not find route for given id")

    s2 = f"select * from patterns where route_id='{route_id}' order by sequence"
    returnD['patterns'] = dbconnect.makeQuery(s2, output='list')
    if not len(returnD['patterns']):
        return returnD

    pattern_idsList = [x['id'] for x in returnD['patterns']]
    pattern_idsListSQL = cf.quoteNcomma(pattern_idsList)
    s3 = f"""select t1.*, t2.name, t2.latitude, t2.longitude 
    from pattern_stops as t1
    left join stops_master as t2
    on t1.stop_id = t2.id
    where t1.pattern_id in ({pattern_idsListSQL})
    order by t1.pattern_id, t1.stop_sequence
    """
    df1 = dbconnect.makeQuery(s3, output='df', keepCols=True)
    # group them
    returnD['pattern_stops'] = {}

    for pid in pattern_idsList:
        df2 = df1[df1['pattern_id'] == pid]
        returnD['pattern_stops'][pid] = df2.to_dict(orient='records')

    return returnD

