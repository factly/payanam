# api_stops.py

import os, time
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
    # criteria: Optional[str] = None
    data: List[str] = []
    indexed: Optional[bool] = False


@app.post("/API/loadStops", tags=["stops"])
def loadStops(req: loadStops_payload):
    cf.logmessage("loadStops api call")

    if len(req.data): cols = ','.join(req.data)
    else: cols = "*" 
    s1 = f"select {cols} from stops_master"
    df = dbconnect.makeQuery(s1, output='df', fillna=False)
    returnD = { 'message': "success"}
    if len(df):
        returnD['stops'] = df.to_dict(orient='records')
        if req.indexed:
            returnD['indexed'] = df.set_index('id').to_dict(orient='index')
    else:
        returnD['stops'] = []
        if req.indexed:
            returnD['indexed'] = {}
    
    time.sleep(5)
    return returnD


###############

class addStops_payload_single(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    group_id: Optional[str] = None
    # stop_id: Optional[str] = None
    # update: Optional[bool] = False

class addStops_payload(BaseModel):
    data: List[addStops_payload_single]

@app.post("/API/addStops", tags=["stops"])
def addStops(req: addStops_payload):
    """
    Add stops
    """
    cf.logmessage("addStops api call")

    # convert request body to json array, from https://stackoverflow.com/a/60845064/4355695
    requestArr = [t.__dict__ for t in req.data ]
    print(requestArr)
    df1 = pd.DataFrame(requestArr)
    # to do: validation: remove the bad ones

    df1['space_id'] = int(os.environ.get('SPACE_ID',1))
    df1['id'] = cf.assignUID(df1)
    
    timestamp = cf.getTime()
    df1['created_on'] = timestamp
    df1['created_by'] = '' # will bring in username later

    df1.to_csv('working/addStops.csv', index=False)

    not_added = []; added = []
    for row in df1.to_dict(orient='records'):
        if not row.get('name'):
            cf.logmessage("No name:",row)
            continue
        
        icols=['space_id', 'id', 'name', 'created_on', 'created_by']
        ivals= [f"{row['space_id']}", f"'{row['id']}'", f"'{row['name']}'", "CURRENT_TIMESTAMP", f"'{row['created_by']}'" ]
        if row.get('latitude'): 
            icols.append('latitude')
            ivals.append(f"{row['latitude']}")
        if row.get('longitude'): 
            icols.append('longitude')
            ivals.append(f"{row['longitude']}")
        if row.get('description'): 
            icols.append('description')
            ivals.append(f"'{row['description']}'")
        if row.get('group_id'): 
            icols.append('group_id')
            ivals.append(f"'{row['group_id']}'")
        

        i1 = f"""insert into stops_master ({','.join(icols)}) values ({','.join(ivals)})"""
        iCount = dbconnect.execSQL(i1)
        if not iCount:
            not_added.append(row)
        else:
            added.append(row)
    
    returnD = { 'message': "success", "num_added": 0, "num_not_added":0, "added":[], "not_added":[] }
    if len(added):
        returnD['num_added'] = len(added)
        returnD['added'] = [x['id'] for x in added]
    if len(not_added):
        returnD['num_not_added'] = len(not_added)
        returnD['not_added'] = [x['id'] for x in not_added]

    return returnD
    # if status:
    #     returnD = { 'message': "success" }
    #     returnD['added'] = len(df1)
        
    # else:
    #     raise HTTPException(status_code=400, detail="Could not insert data")

################

class updateStops_payload_single(BaseModel):
    stop_id: str
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    group_id: Optional[str] = None

class updateStops_payload(BaseModel):
    data: List[updateStops_payload_single]

@app.post("/API/updateStops", tags=["stops"])
def updateStops(req: updateStops_payload):
    """
    Update stops
    """
    cf.logmessage("updateStops api call")

    # convert request body to json array, from https://stackoverflow.com/a/60845064/4355695
    requestArr = [t.__dict__ for t in req.data ]
    print(requestArr)
    df1 = pd.DataFrame(requestArr)
    df1['space_id'] = int(os.environ.get('SPACE_ID',1))
    timestamp = cf.getTime()
    df1['last_updated'] = timestamp
    df1['modified_by'] = '' # will bring in username later
    # to do : validation etc

    updated = []; not_updated = []
    for row in df1.to_dict(orient='records'):
        if not row.get('stop_id'): 
            cf.logmessage("No stop_id:",row)
            continue
        uterms = []
        if row.get('name'): uterms.append(f"name='{row['name']}'")
        if row.get('latitude'): uterms.append(f"latitude={row['latitude']}")
        if row.get('longitude'): uterms.append(f"longitude={row['longitude']}")
        if row.get('description'): uterms.append(f"description='{row['description']}'")
        if row.get('group_id'): uterms.append(f"group_id='{row['group_id']}'")

        u1 = f"""update stops_master set {', '.join(uterms)} where id='{row['stop_id']}' """
        uCount = dbconnect.execSQL(u1)
        if not uCount:
            not_updated.append(row)
        else:
            updated.append(row)

    returnD = { 'message': "success", "num_updated": 0, "num_not_updated":0, "updated":[], "not_updated":[] }
    if len(updated):
        returnD['num_updated'] = len(updated)
        returnD['updated'] = [x['name'] for x in updated]
    if len(not_updated):
        returnD['num_not_updated'] = len(not_updated)
        returnD['not_updated'] = [x['name'] for x in not_updated]

    return returnD


###############

class deleteStops_payload(BaseModel):
    idsList: List[str]

@app.post("/API/deleteStops", tags=["stops"])
def deleteStops(req: deleteStops_payload):
    """
    Delete stops
    """
    cf.logmessage("deleteStops api call")
    idsList = req.idsList
    idsListSQL = cf.quoteNcomma(idsList)
    d1 = f"delete from stops_master where id in ({idsListSQL})"
    dCount = dbconnect.execSQL(d1)

    returnD = { "message": "success", "deleted": dCount }
    if dCount:
        return returnD
    else:
        raise HTTPException(status_code=400, detail="Nothing  to delete")

###############

@app.get("/API/searchStops", tags=["stops"])
def searchStops(q: Optional[str] = None ):
    """
    for working with https://opengeo.tech/maps/leaflet-search/examples/ajax-jquery.html
    response should be like: [{"loc":[41.57573,13.002411],"title":"black"}]
    """
    s1 = f"""select name, latitude, longitude from stops_master
    where name ilike '%{q}%'
    and latitude is not null
    and longitude is not null
    order by name
    """
    df = dbconnect.makeQuery(s1, output='df')
    result = []
    if not len(df):
        return result

    for row in df.to_dict(orient='records'):
        result.append({
            "loc": [row['latitude'], row['longitude']],
            "title": row['name']    
        })
    return result
