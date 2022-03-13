# api_stops.py

import os, time
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header, Path
import pandas as pd

from payanam_launch import app
import commonfuncs as cf
import dbconnect


###############

def fetchNumRoutes():
    
    # fetch the num of routes all the stops belong to
    s1 = f"""select id, num_routes from
        (select id, count(route_id) as num_routes from 
            (select t1.id, t3.route_id
            from stops_master as t1
            left join pattern_stops as t2
            on t1.id = t2.stop_id
            left join patterns as t3
            on t2.pattern_id = t3.id) as foo
        group by id) as bar
    where num_routes > 0
    """
    routenumList = dbconnect.makeQuery(s1, output='list')
    routeNumD = {x['id']:x['num_routes'] for x in routenumList}
    return routeNumD


    




###############

class loadStops_payload(BaseModel):
    # criteria: Optional[str] = None
    data: List[str] = []
    main: Optional[bool] = True
    indexed: Optional[bool] = False
    unique: Optional[bool] = False


@app.post("/API/loadStops", tags=["stops"])
def loadStops(req: loadStops_payload):
    cf.logmessage("loadStops api call")

    if len(req.data): 
        if ['zap'] not in req.data:
            req.data.append('zap')
        cols = ','.join(req.data)
    else: 
        # cols = ','.join(['id','name','description','latitude','longitude','stop_group_id','created_on','created_by','last_updated','modified_by'])
        cols = ','.join(['id','name','description','latitude','longitude','zap'])
    
    space_id = int(os.environ.get('SPACE_ID',1))
    s1 = f"select {cols} from stops_master where space_id = {space_id}"
    df = dbconnect.makeQuery(s1, output='df', fillna=False)
    returnD = { 'message': "success"}
    if len(df):
        if req.unique:
            routeNumD = fetchNumRoutes()
            df['num_routes'] = df['id'].apply(lambda x: routeNumD.get(x,0))
            def grouper1(x):
                row = {}
                row['count'] = len(x)
                row['locations'] = len(set(zip([l for l in x['latitude'] if l], [l for l in x['longitude'] if l])))
                if 'name' in x.columns:
                    names = x['name'].unique().tolist()
                    row['names'] = '|'.join(names)
                    row['num_names'] = len(names)
                routes = [routeNumD.get(y, 0) for y in x['id'].tolist()]
                row['num_routes'] = sum(routes)
                return pd.Series(row)

            df2 = df.groupby('zap').apply(grouper1).reset_index(drop=False)
            returnD['unique'] = df2.to_dict(orient='records')

        if req.main:
            returnD['stops'] = df.to_dict(orient='records')
        
        if req.indexed:
            returnD['indexed'] = df.set_index('id', drop=False).to_dict(orient='index')

        
    else:
        if req.main:
            returnD['stops'] = []
        if req.indexed:
            returnD['indexed'] = {}
        if req.unique:
            returnD['unique'] = []

    
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

    # remove duplicates
    df1 = df1.drop_duplicates('name').copy()

    df1['space_id'] = int(os.environ.get('SPACE_ID',1))
    df1['id'] = cf.assignUID(df1)
    
    timestamp = cf.getTime()
    df1['created_on'] = timestamp
    df1['created_by'] = '' # will bring in username later

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
        returnD['added'] = [{"stop_id":x['id'], "name":x['name']} for x in added]
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

# def checkStopDependency(idsList, space_id):
#     idsListSQL = cf.quoteNcomma(idsList)

#     # scan pattern_stops
#     s1 = f"""select t1.count(*) as count, t1.pattern_id, 
#     t2.name as pattern_name, t2.route_id, t3.name as route_name, t3.depot
#     from pattern_stops as t1
#     left join patterns as t2
#     on t1.pattern_id = t2.id
#     left join routes as t3
#     on t2.route_id = t3.id
#     where t1.space_id = {space_id}
#     and stop_id in ({idsListSQL})
#     """
#     df = dbconnect.makeQuery(s1, output='df', fillna=True)

#     if not len(df):
#         # no stop dependency
#         return False, {}

#     details = {}
#     details['routesList'] = df['route_name'].unique().tolist()
#     details['patternsList'] = df['pattern_id'].unique().tolist()
#     details['count'] = len(df)
#     return True, details


class deleteStops_payload(BaseModel):
    idsList: List[str]

@app.post("/API/deleteStops", tags=["stops"])
def deleteStops(req: deleteStops_payload):
    """
    Delete stops
    """
    cf.logmessage("deleteStops api call")
    idsList = req.idsList
    space_id = int(os.environ.get('SPACE_ID',1))

    # dependencyStatus, details = checkStopDependency(idsList, space_id)

    # if not dependencyStatus:
    idsListSQL = cf.quoteNcomma(idsList)
    d1 = f"delete from stops_master where id in ({idsListSQL})"
    dCount = dbconnect.execSQL(d1)

    returnD = { "message": "success", "deleted": dCount, "confirmation_required": False }
    if dCount:
        return returnD
    else:
        raise HTTPException(status_code=400, detail="Nothing  to delete")
    # else:
    #     returnD = details
    #     returnD['message'] = 'success'
    #     returnD['confirmation_required'] = True
    #     return returnD


# class deleteStopsConfirm_payload(BaseModel):
#     idsList: List[str]

# @app.post("/API/deleteStopsConfirm", tags=["stops"])
# def deleteStopsConfirm(req: deleteStopsConfirm_payload):
#     """
#     Delete stops - Confirm
#     """
#     cf.logmessage("deleteStopsConfirm api call")
#     idsList = req.idsList
#     idsListSQL = cf.quoteNcomma(idsList)
#     d1 = f"delete from stops_master where id in ({idsListSQL})"
#     dCount = dbconnect.execSQL(d1)

#     returnD = { "message": "success", "deleted": dCount }
#     if dCount:
#         return returnD
#     else:
#         raise HTTPException(status_code=400, detail="Nothing  to delete")

###############

@app.get("/API/searchStops", tags=["stops"])
def searchStops(q: Optional[str] = None ):
    """
    for working with https://opengeo.tech/maps/leaflet-search/examples/ajax-jquery.html
    response should be like: [{"loc":[41.57573,13.002411],"title":"black"}]
    """
    space_id = int(os.environ.get('SPACE_ID',1))
    s1 = f"""select name, latitude, longitude from stops_master
    where space_id = {space_id}
    and name ilike '%{q}%'
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
    space_id = int(os.environ.get('SPACE_ID',1))

    returnD = { "message": "success" }

    # find the patterns
    s1 = f"""select distinct pattern_id from pattern_stops 
    where space_id = {space_id}
    and stop_id in ({idsListSQL})"""
    patternsList = dbconnect.makeQuery(s1, output='column')

    if len(patternsList):

        # find which routes affected
        patternsListSQL = cf.quoteNcomma(patternsList)
        s4 = f"""select distinct route_id from patterns 
        where space_id = {space_id}
        and id in ({patternsListSQL})"""
        routesList = dbconnect.makeQuery(s4, output='column')
        returnD['routeCount'] = len(routesList)

        # delete stop's entries from pattern_stops
        d1 = f"""delete from pattern_stops 
        where space_id = {space_id}
        and stop_id in ({idsListSQL})"""
        pattern_deleted = dbconnect.execSQL(d1)
        returnD['patternCount'] = pattern_deleted

        # now, update job in all the patterns where this stop was.

        for pN, pattern_id in enumerate(patternsList):
            s2 = f"""select id, stop_id, stop_sequence from pattern_stops 
            where space_id = {space_id}
            and pattern_id='{pattern_id}'
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

class combineStops_payload(BaseModel):
    idsList: List[str]
    target_id: Optional[str] = None
    new_name: Optional[str] = None
    new_latitude: Optional[float] = None
    new_longitude: Optional[float] = None
    new_description: Optional[str] = None

@app.post("/API/combineStops", tags=["stops"])
def combineStops(req: combineStops_payload ):
    cf.logmessage("combineStops api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { "message": "success" }

    # validations / new stop flow
    if not req.target_id:
        if not req.new_name or not req.new_latitude or not req.new_longitude:
            raise HTTPException(status_code=400, detail="Invalid data")

        target_stop_id = cf.makeUID()
        icols=['space_id', 'id', 'name', 'latitude', 'longitude', 'created_on', 'zap']
        ivals= [f"{space_id}", f"'{target_stop_id}'", f"'{req.new_name}'", f"{req.new_latitude}", f"{req.new_longitude}" \
            "CURRENT_TIMESTAMP", f"'{cf.zapper(req.new_name)}'" ] 

        if row.get('description'): 
            icols.append('description')
            ivals.append(f"'{row['description']}'")
        # if row.get('group_id'): 
        #     icols.append('group_id')
        #     ivals.append(f"'{row['group_id']}'")
        
        i1 = f"""insert into stops_master ({','.join(icols)}) values ({','.join(ivals)})"""
        iCount = dbconnect.execSQL(i1)
        if not iCount:
            raise HTTPException(status_code=400, detail="Unable to create new stop in DB")
    
        returnD["new_stop_id"] = target_stop_id 

    else:
        target_stop_id = req.target_id
        s1 = f"select count(*) from stops_master where space_id={space_id} and id='{target_stop_id}'"
        s1Count = dbconnect.makeQuery(s1, output='oneValue')
        if s1Count != 1:
            raise HTTPException(status_code=400, detail="Invalid target_id")
    

    # replacing in pattern_stops
    idsList = [x for x in req.idsList if x != target_stop_id] # exclude the chosen one
    idsListSQL = cf.quoteNcomma(idsList)
    # to do: validation of the to-replace stops

    u1 = f"""update pattern_stops
    set stop_id = '{target_stop_id}'
    where stop_id in ({idsListSQL})
    """
    u1Count = dbconnect.execSQL(u1)
    returnD['replace_count'] = u1Count
    
    # getting rid of the extra stops in stops_master
    d1 = f"""delete from stops_master
    where id in ({idsListSQL})
    """
    d1Count = dbconnect.execSQL(d1)
    returnD['deleted_stops'] = d1Count
    
    return returnD
