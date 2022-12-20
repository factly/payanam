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

space_id = int(os.environ.get('SPACE_ID',1))

##########

class loadRoutesList_payload(BaseModel):
    name: Optional[str] = None

@app.post("/API/loadRoutesList", tags=["routes"])
def loadRoutesList(req: loadRoutesList_payload):
    cf.logmessage("loadRoutes api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    returnD = { 'message': "success"}
    

    s1 = f"""select id, name, depot from routes 
    where space_id = {space_id}
    order by depot, name"""
    df = dbconnect.makeQuery(s1, output='df')

    if not len(df):
        returnD['routes'] = []
        returnD['depots'] = []
        return returnD

    df['depot'].replace(to_replace={'':'MISC'}, inplace=True)
    # df.rename(columns={'name':'text'}, inplace=True)

    
    # # TO DO: group by depots, route groups etc in this format: 
    # # https://select2.org/data-sources/formats#grouped-data
    # returnD['routes'] = []
    # for depot in df['depot'].unique():
    #     row = {}
    #     if not len(depot): row['text'] = "MISC"
    #     else: row['text'] = depot
    #     df2 = df[df['depot']==depot]
    #     row['children'] = df2.to_dict(orient='records')
    #     returnD['routes'].append(row)

    returnD['routes'] = df.to_dict(orient='records')
    returnD['depots'] = df['depot'].unique().tolist()

    return returnD

    # if len(df):
    #     returnD['results'] = df.to_dict(orient='records') 
    # else:
    #     returnD['results'] = []
    
    # return returnD


##########

class addRoute_payload(BaseModel):
    name: str
    description: Optional[str] = None
    depot: Optional[str] = None
    route_id: Optional[str] = None

@app.post("/API/addRoute", tags=["routes"])
def addRoute(req: addRoute_payload):
    cf.logmessage("addRoute api call")
    # turn request body to dict
    reqD = req.__dict__
    cf.logmessage(reqD)
    
    # to do: validation

    if reqD.get('description'): 
        descriptionHolder = f"'{reqD['description']}'"
    else:
        descriptionHolder = "NULL"
    
    if reqD.get('depot'): 
        depotHolder = f"'{reqD['depot']}'"
    else:
        depotHolder = "NULL"

    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { "message": "success" }

    if not reqD.get('route_id'):
        # create new route flow
        route_id = cf.makeUID()
        i1 = f"""insert into routes (space_id, id, name, created_on, description, depot )
        values ({space_id}, '{route_id}', '{reqD['name']}', CURRENT_TIMESTAMP, {descriptionHolder}, {depotHolder} )
        """
        iCount = dbconnect.execSQL(i1)
        if not iCount:
            raise HTTPException(status_code=400, detail="Could not create route")

        returnD["id"] = route_id
        
        # also create basic 2 patterns for the route: UP and DOWN
        pid1 = cf.makeUID()
        pid2 = cf.makeUID()
        i2 = f"""insert into patterns (space_id, id, route_id, name, sequence, created_on)
        values ({space_id}, '{pid1}', '{route_id}', 'UP', 1, CURRENT_TIMESTAMP),
        ({space_id}, '{pid2}', '{route_id}', 'DOWN', 2, CURRENT_TIMESTAMP)
        """
        iCount2 = dbconnect.execSQL(i2)
        if not iCount2:
            cf.logmessage("Warning: Could not create patterns")
        else: 
            returnD["patterns"] = [pid1, pid2]
        
    else:
        # update route
        u1 = f"""update routes
        set name = '{reqD['name']}',
        depot = {depotHolder},
        description = {descriptionHolder},
        last_updated = CURRENT_TIMESTAMP
        where id='{reqD['route_id']}'
        """
        uCount = dbconnect.execSQL(u1)
        if not uCount:
            raise HTTPException(status_code=400, detail="Could not create route")
        returnD["updated"] = uCount
    return returnD


##########
class loadRouteDetails_payload(BaseModel):
    route_id: str

@app.post("/API/loadRouteDetails", tags=["routes"])
def loadRouteDetails(req: loadRouteDetails_payload):
    cf.logmessage("loadRouteDetails api call")
    route_id = req.route_id
    returnD = { "message": "success"}
    space_id = int(os.environ.get('SPACE_ID',1))

    s1 = f"""select * from routes 
    where space_id = {space_id}
    and id='{route_id}'"""
    returnD['route'] = dbconnect.makeQuery(s1, output='oneJson')
    if not returnD['route'].get('name') :
        raise HTTPException(status_code=400, detail="Could not find route for given id")

    s2 = f"""select * from patterns 
    where space_id = {space_id}
    and route_id='{route_id}' order by sequence"""
    returnD['patterns'] = dbconnect.makeQuery(s2, output='list')
    if not len(returnD['patterns']):
        return returnD


    return returnD


##########

# get depots list
@app.get("/API/getDepots", tags=["routes"])
def getDepots():
    cf.logmessage("getDepots api call")
    returnD = { "message": "success"}
    space_id = int(os.environ.get('SPACE_ID',1))

    s1 = f"select distinct depot from routes where space_id={space_id} order by depot"
    depotsList = dbconnect.makeQuery(s1, output='column')
    returnD['depots'] = depotsList
    return returnD


##########

@app.get("/API/getRouteShapes", tags=["routes"])
def getRouteShapes(route_id: str, precision: Optional[int]=6):
    cf.logmessage("getRouteShapes api call")
    returnD = { "message": "success"}

    s1 = f"""
    select t1.id as route_id, t1.name as route_name,
    t2.id as pattern_id, t2.name as pattern_name,
    ST_AsEncodedPolyline(ST_MakeLine(Q.geopoint::geometry ORDER BY Q.stop_sequence), {precision}) AS geoline
    from routes as t1
    left join patterns as t2
    on t1.id = t2.route_id
    left join (SELECT t3.stop_sequence, t4.geopoint, t3.pattern_id
        from pattern_stops as t3
        left join stops_master as t4
        on t3.stop_id = t4.id
        where t4.geopoint is not null
        order by t3.stop_sequence
        ) as Q
    on t2.id = Q.pattern_id
    where t1.id = '{route_id}'
    group by t1.id, t2.id
    """

    returnD['patterns'] = dbconnect.makeQuery(s1, output="list")
    return returnD
    