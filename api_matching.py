# api_matching.py
# this component will contain all stop matching, guessing related work

from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header
import pandas as pd
import os
import jellyfish as jf # for fuzzy search

from payanam_launch import app
import commonfuncs as cf
import dbconnect


space_id = int(os.environ.get('SPACE_ID',1))



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

@app.post("/API/suggestMatches", tags=["matching"])
def suggestMatches(req: suggestMatches_payload):
    cf.logmessage("suggestMatches api call")

    space_id = int(os.environ.get('SPACE_ID',1))
    stop_name_zap = cf.zapper(req.name)

    s1 = f"""select id, zap, name, latitude, longitude from stops_master
    where space_id = {space_id}
    and latitude between {req.minLat} and {req.maxLat}
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


#######################


class autoMapPattern_payload(BaseModel):
    pattern_id: str
    minLat: float = -90
    maxLat: float = 90
    minLon: float = -180
    maxLon: float = 180
    fuzzy: Optional[bool] = True
    accuracy: Optional[float] = 0.8
    maxRows: Optional[int] = 10
    depot: Optional[str] = None
    autoMap: Optional[bool] = False

@app.post("/API/autoMapPattern", tags=["matching"])
def autoMapPattern(req: autoMapPattern_payload):
    cf.logmessage("suggestMatches api call")

    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { "message": "success"}

    # fetch all the unmapped stop names
    s1 = f"""select t1.id, t1.stop_sequence, t1.stop_id, 
    t2.name, t2.zap
    from pattern_stops as t1
    left join stops_master as t2
    on t1.stop_id = t2.id
    where t1.pattern_id = '{req.pattern_id}'
    and t2.latitude is NULL
    and t1.space_id = {space_id}
    order by t1.stop_sequence
    """
    pStopsdf = dbconnect.makeQuery(s1, output='df')
    returnD['unmapped_stops'] = pStopsdf.to_dict(orient='records')
    

    if not len(pStopsdf):
        returnD['noneed'] = True
        return returnD
    else:
        returnD['noneed'] = False

    s1 = f"""select id as stop_id, zap, name, latitude, longitude from stops_master
    where space_id = {space_id}
    and latitude between {req.minLat} and {req.maxLat}
    and longitude between {req.minLon} and {req.maxLon}
    """
    dfMapped = dbconnect.makeQuery(s1, output='df')
    returnD['scanned'] = len(dfMapped)
    if not len(dfMapped):
        cf.logmessage("No stops mapped within given co-ords")
        return returnD
    else:
        cf.logmessage(f"Got {len(dfMapped)} locations within the lat-long bounds")

    matchCollector = []
    suggestionCollector = []
    nomatches = []
    for sN, srow in pStopsdf.iterrows():

        stop_name_zap = srow['zap']
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
        # take first stop_id match in filter
        if len(filter1):
            # print(f"{srow['name']}: {len(filter1)} matches found")
            matchCollector.append({
                'id': srow['id'],
                'old_stop_id': srow['stop_id'],
                'new_stop_id': filter1['stop_id'].tolist()[0]
            })
            if not req.autoMap:
                suggestionCollector.append({
                    'id': srow['id'],
                    'matches': filter1.to_dict(orient='records')
                })
        else:
            cf.logmessage(f"{srow['name']}: no match found")
            nomatches.append({'id': srow['id'], 'name':srow['name']})
    
    returnD['automapped_count'] = 0
    returnD['matchCollector'] = matchCollector
    returnD['suggestionCollector'] = suggestionCollector
    returnD['nomatches'] = nomatches
    
    if req.autoMap:
        # take matchCollector and do it
        for mrow in matchCollector:
            u1 = f"""update pattern_stops
            set stop_id = '{mrow['new_stop_id']}'
            where id='{mrow['id']}'
            """
            # print(' '.join(u1.split()))
            u1Count = dbconnect.execSQL(u1)
            returnD['automapped_count'] += u1Count

    
    return returnD


#####################

# making an api call to fetch details of all unmapped routes etc - for later use

class unMappedData_payload(BaseModel):
    criteria: Optional[str] = None

@app.post("/API/unMappedData", tags=["matching"])
def unMappedData(req: unMappedData_payload):
    cf.logmessage("suggestMatches api call")

    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { "message": "success"}

    s1 = f"""select t3.depot, t3.name as route, t2.name as pattern, t1.stop_sequence, t4.name as stop_name, t1.stop_id
    from pattern_stops as t1
    left join patterns as t2
    on t1.pattern_id = t2.id
    left join routes as t3
    on t2.route_id = t3.id
    left join stops_master as t4
    on t1.stop_id = t4.id
    where t3.space_id = {space_id}
    and t4.latitude is null
    order by t3.depot, route, pattern, t1.stop_sequence
    """
    list1 = dbconnect.makeQuery(s1, output='list')
    returnD['data'] = list1
    return returnD

