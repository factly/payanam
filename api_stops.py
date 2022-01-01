# api_stops.py

import os, time
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header, Path
import pandas as pd
import jellyfish as jf # for fuzzy search

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

    if len(req.data): 
        cols = ','.join(req.data)
    else: 
        cols = ','.join(['id','name','description','latitude','longitude','stop_group_id','created_on','created_by','last_updated','modified_by'])
    
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
    # print(requestArr)
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
        
        icols=['space_id', 'id', 'name', 'created_on', 'created_by', 'zap']
        ivals= [f"{row['space_id']}", f"'{row['id']}'", f"'{row['name']}'", \
            "CURRENT_TIMESTAMP", f"'{row['created_by']}'", f"'{cf.zapper(row['name'])}'" ] 
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
        if row.get('name'): 
            uterms.append(f"name='{row['name']}'")
            uterms.append(f"zap='{cf.zapper(row['name'])}'")
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


###############

class diagnoseStops_payload(BaseModel):
    idsList: List[str]

@app.post("/API/diagnoseStops", tags=["stops"])
def diagnoseStops(req: diagnoseStops_payload ):
    '''
    Diagnose stops for deleting
    Fetch each stop's patterns, routes
    '''
    cf.logmessage("diagnoseStops api call")
    idsListSQL = cf.quoteNcomma(req.idsList)
    s1 = f"""
    select t1.stop_id, t1.pattern_id, 
    t2.route_id, t2.name as pattern_name, 
    t3.depot, t3.name, t3.description
    from pattern_stops as t1 
    left join patterns as t2
    on t1.pattern_id = t2.id
    left join routes as t3
    on t2.route_id = t3.id
    where t1.stop_id in ({idsListSQL})
    """
    df1 = dbconnect.makeQuery(s1, output='df', fillna=False)

    returnD = { "message": "success" }
    if not len(df1):
        returnD['patternCount'] = 0
        return returnD

    # returnD['stops'] = df1.to_dict(orient='records')
    # print(df1)
    # print(df1['route_id'])
    # return returnD
    # print("uniques:",df1['route_id'].unique())
    
    returnD['patterns'] = [x for x in df1['pattern_id'].unique() if x is not None]
    returnD['patternCount'] = len(returnD['patterns'])

    returnD['routes'] = [x for x in df1['route_id'].unique() if x is not None]
    returnD['routeCount'] = len(returnD['routes'])

    return returnD



###############

class deleteStopsConfirm_payload(BaseModel):
    idsList: List[str]

@app.post("/API/deleteStopsConfirm", tags=["stops"])
def deleteStopsConfirm(req: deleteStopsConfirm_payload ):
    cf.logmessage("deleteStopsConfirm api call")
    idsListSQL = cf.quoteNcomma(req.idsList)

    returnD = { "message": "success" }

    # find the patterns
    s1 = f"select distinct pattern_id from pattern_stops where stop_id in ({idsListSQL})"
    patternsList = dbconnect.makeQuery(s1, output='column')

    if len(patternsList):

        # find which routes affected
        patternsListSQL = cf.quoteNcomma(patternsList)
        s4 = f"select distinct route_id from patterns where id in ({patternsListSQL})"
        routesList = dbconnect.makeQuery(s4, output='column')
        returnD['routeCount'] = len(routesList)

        # delete stop's entries from pattern_stops
        d1 = f"delete from pattern_stops where stop_id in ({idsListSQL})"
        pattern_deleted = dbconnect.execSQL(d1)
        returnD['patternCount'] = pattern_deleted

        # now, update job in all the patterns where this stop was.

        for pN, pattern_id in enumerate(patternsList):
            s2 = f"""select id, stop_id, stop_sequence from pattern_stops 
            where pattern_id='{pattern_id}'
            order by stop_sequence
            """
            pattern_stops = dbconnect.makeQuery(s2, output='list', fillna=False)
            # cf.logmessage(f"Pattern {pattern_id}: {len(pattern_stops)} stops originally")

            counter = 0
            for row in pattern_stops:
                if row['stop_id'] in req.idsList:
                    # pattern_deleted += 1
                    continue
                counter +=1
                if row['stop_sequence'] == counter:
                    # sequence is as-is, do nothing
                    continue
                else: 
                    u1 = f"""update pattern_stops set stop_sequence={counter}
                    where id='{row['id']}'
                    """
                    ustatus = dbconnect.execSQL(u1)
            
            if counter > 0:
                cf.logmessage(f"Changed pattern {pattern_id}, stops count changed to {counter}")

    # else if the stop isn't in any patterns, proceed to delete from stops_master
    
    # now delete from stops master
    d3 = f"delete from stops_master where id in ({idsListSQL})"
    dcount = dbconnect.execSQL(d3)
    returnD['stopCount'] = dcount

    return returnD


###############

class suggestMatches_payload(BaseModel):
    name: str
    minLat: float = -90
    maxLat: float = 90
    minLon: float = -180
    maxLon: float = 180
    fuzzy: Optional[bool] = True
    accuracy: Optional[float] = 0.8
    maxRows: Optional[int] = 10
    depot: Optional[str] = None
    orig_id: Optional[str] = None

@app.post("/API/suggestMatches", tags=["stops"])
def suggestMatches(req: suggestMatches_payload):
    cf.logmessage("suggestMatches api call")

    # # convert request body to json, from https://stackoverflow.com/a/60845064/4355695
    # row = req.__dict__
    # print(row)
    # return row
    stop_name_zap = cf.zapper(req.name)

    s1 = f"""select id, zap, name, latitude, longitude from stops_master
    where latitude between {req.minLat} and {req.maxLat}
    and longitude between {req.minLon} and {req.maxLon}
    """
    dfMapped = dbconnect.makeQuery(s1, output='df')

    if req.orig_id:
        # remove the original stop from the matches
        dfMapped = dfMapped[dfMapped['id']!= req.orig_id].copy()
    
    cf.logmessage(f"Got {len(dfMapped)} locations within the lat-long bounds")
    
    # filter 1 : get name matches
    if not req.fuzzy:
        # direct match
        filter1 = ( dfMapped[ dfMapped['zap'] == stop_name_zap ].copy()
            .drop_duplicates(subset=['latitude','longitude']).copy()
            .head(req.maxRows).copy().reset_index(drop=True)
        )
        # putting inside () to make mutli-line possible here
    else:
        # dfMapped['Fpartial'] = dfMapped['zap'].apply( lambda x: fuzz.partial_ratio(stop_name_zap,x) )
        dfMapped['score'] = dfMapped['zap'].apply( lambda x: jf.jaro_winkler(stop_name_zap,x) )
        
        filter1 = ( dfMapped[dfMapped['score'] >= req.accuracy ].sort_values('score',ascending=False)
            .drop_duplicates(subset=['latitude','longitude']).copy()
            .head(req.maxRows).copy().reset_index(drop=True)
        )

        # below accuracy=0.8, observed its normally too much mismatch, so better to limit it.
        
        # skipping ranking, source and databank parts from orig payanam for now

    cf.logmessage(f"{req.name}: {len(filter1)} matches found")

    del filter1['zap']

    returnD = { 'message': "success"}
    returnD['hits'] = len(filter1)
    if len(filter1):
        returnD['data'] = filter1.to_dict(orient='records')

    return returnD

