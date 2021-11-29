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
    else:
        returnD = { "message": "success",
            "id": route_id
        }
        return returnD