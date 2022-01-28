# api_timings.py

import os, time
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header, Path, Request
import pandas as pd
import jellyfish as jf # for fuzzy search

from payanam_launch import app
import commonfuncs as cf
import dbconnect


class loadTimings_payload(BaseModel):
    pattern_id: str

@app.post("/API/loadTimings", tags=["timings"])
def loadTimings(req: loadTimings_payload):
    cf.logmessage("loadTimings api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    pattern_id = req.pattern_id
    returnD = { 'message': "success", "stops":[], "trips":[], "num_trips":0 }

    # stops
    s1 = f"""select t1.stop_sequence, t1.stop_id, t2.name 
    from pattern_stops as t1
    left join stops_master as t2
    on t1.stop_id = t2.id
    where t1.space_id={space_id} 
    and t1.pattern_id = '{pattern_id}'
    order by t1.stop_sequence
    """
    df1 = dbconnect.makeQuery(s1, output='df', keepCols=True, fillna=True)
    returnD['stops'] = df1.to_dict(orient='records')

    # trips
    s2 = f"""select * from trips 
    where space_id={space_id} 
    and pattern_id = '{pattern_id}'
    order by start_time
    """
    df2 = dbconnect.makeQuery(s2, output='df', keepCols=True, fillna=True)
    df2['start_time'] = df2['start_time'].apply(lambda x: str(x)[:5])

    returnD['num_trips'] = len(df2)
    returnD['trips'] = df2.to_dict(orient='records')


    # timings
    if len(df2):
        trip_idSQL = cf.quoteNcomma(df2['id'].tolist())
        s3 = f"""select trip_id, stop_sequence, arrival_time from stop_times
        where space_id={space_id} 
        and trip_id in ({trip_idSQL})
        order by trip_id, stop_sequence
        """
        df3 = dbconnect.makeQuery(s3, output='df', keepCols=True, fillna=True)
        # df3['trip_id'] = df3['trip_id'].apply(lambda x: f"trip_{x}")
        df3['arrival_time'] = df3['arrival_time'].apply(lambda x: str(x)[:5])

    else:
        df3 = pd.DataFrame(columns=['trip_id', 'stop_sequence', 'arrival_time'])
    
    
    # pivot by trip_id
    df4 = df3.pivot(index='stop_sequence', columns='trip_id', values='arrival_time').fillna('').reset_index()

    # merge in stop ids, names
    df5 = pd.merge(df1, df4, on='stop_sequence', how='left')

    # sort by start timings
    allCols = list(df5.columns)
    tripCols = [x for x in allCols if x not in ('stop_sequence', 'stop_id', 'name')]
    newCols = ['stop_sequence', 'stop_id', 'name'] + sorted(tripCols)

    returnD['stop_times'] = df5[newCols].to_dict(orient='records')
    
    # TO DO: calc stop times offset from first trip or so

    cf.logmessage(f"Got {len(df2)} trips, {len(df3)} timings total")

    return returnD


############


@app.post("/API/saveTimings", tags=["timings"])
async def saveTimings(req: Request):
    cf.logmessage("saveTimings api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    returnD = { 'message': "success"}

    # making the api take a custom json array
    # from https://stackoverflow.com/a/64379772/4355695 (that and other answers)
    reqD = await req.json()
    # print(reqD)

    if (not len(reqD.get('data',[]))) or (not isinstance(reqD.get('data',[]),list)) :
        raise HTTPException(status_code=400, detail="No data")

    df1 = pd.DataFrame(reqD['data']).fillna('')
    if 'stop_id' in df1.columns: del df1['stop_id']
    if 'name' in df1.columns: del df1['name']

    keepcols = ['stop_sequence']
    df2 = pd.melt(df1, id_vars=keepcols, var_name='trip_id', value_name='arrival_time').sort_values(['trip_id','stop_sequence']).reset_index(drop=True)
    # df2.to_csv('stop_times.csv',index=False)

    df2['id'] = cf.assignUID(df2)
    df2['space_id'] = space_id


    # TO DO: time validation
    for N in range(len(df2)):
        if df2.at[N,'arrival_time'] == '':
            df2.at[N,'arrival_time'] = None

    tripsList = df2['trip_id'].unique().tolist()
    if not len(tripsList):
        raise HTTPException(status_code=400, detail="No tripIds in data")
    trip_idSQL = cf.quoteNcomma(tripsList)


    # fully delete existing stop_times for this pattern and replace with new
    d1 = f"""delete from stop_times
    where space_id = {space_id} 
    and trip_id in ({trip_idSQL})"""
    dCount1 = dbconnect.execSQL(d1)
    returnD['old_count'] = dCount1

    # df2.to_csv('sample.csv')
    iStatus1 = dbconnect.addTable(df2, 'stop_times')
    if not iStatus1:
        returnD['new_count'] = 0
        raise HTTPException(status_code=400, detail="Failed to add stop_times data in DB");

    # update trips data
    # get all start times
    start_times_lookup = df2[df2['stop_sequence']==1][['trip_id','arrival_time']].copy().set_index('trip_id').to_dict(orient='index')
    print(start_times_lookup)

    # to do later: get all end times also. Or, decide to drop that and don't bother.

    returnD['trips_updated'] = 0
    for trip_id in tripsList:
        uList = []
        uList.append(f"last_updated = CURRENT_TIMESTAMP")
        uList.append(f"modified_by = 'admin'")
        if start_times_lookup.get(trip_id, False):
            start_time = start_times_lookup[trip_id]['arrival_time']
            uList.append(f"start_time = '{start_time}'")
            uList.append(f"name = '{trip_id}_{start_time}'")
        else:
            uList.append(f"start_time = NULL")
            uList.append(f"name = '{trip_id}'")

        u1 = f"""update trips
        set {', '.join(uList)}
        where space_id = {space_id}
        and id = '{trip_id}'
        """
        uCount = dbconnect.execSQL(u1)
        returnD['trips_updated'] += uCount

    returnD['new_count'] = len(df2)
    return returnD


################

class deleteTrip_payload(BaseModel):
    pattern_id: str
    trip_id: str

@app.post("/API/deleteTrip", tags=["timings"])
async def deleteTrip(req: deleteTrip_payload):
    cf.logmessage("deleteTrip api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    pattern_id = req.pattern_id
    trip_id = req.trip_id

    # check if its there in trips table and stop_times table
    s1 = f"""select count(*) from trips
    where space_id = {space_id}
    and pattern_id = '{pattern_id}'
    and id = '{trip_id}'
    """
    c1 = dbconnect.makeQuery(s1, output='oneValue')

    s2 = f"""select count(*) from stop_times
    where space_id = {space_id}
    and trip_id = '{trip_id}'
    """
    c2 = dbconnect.makeQuery(s2, output='oneValue')

    returnD = { "message": "success", "trips_deleted":0, "stop_times_deleted":0 }
    if c1:
        d1 = f"""delete from trips
        where space_id = {space_id}
        and pattern_id = '{pattern_id}'
        and id = '{trip_id}' 
        """
        d1Count = dbconnect.execSQL(d1)
        returnD['trips_deleted'] = d1Count

    if c2:
        d2 = f"""delete from stop_times
        where space_id = {space_id}
        and trip_id = '{trip_id}'
        """
        d2Count = dbconnect.execSQL(d2)
        returnD['stop_times_deleted'] = d2Count

    return returnD

################

class addTrip_payload(BaseModel):
    pattern_id: str
    start_time: str

@app.post("/API/addTrip", tags=["timings"])
async def deleteTrip(req: addTrip_payload):
    cf.logmessage("addTrip api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    pattern_id = req.pattern_id
    start_time = req.start_time

    trip_id = cf.makeUID()
    i1 = f"""insert into trips
    (space_id, id, pattern_id, start_time, name) values
    ({space_id}, '{trip_id}', '{pattern_id}', '{start_time}', '{trip_id}_{start_time}')
    """

    s1 = f"""select stop_sequence, stop_id from pattern_stops
    where space_id = {space_id}
    and pattern_id = '{pattern_id}'
    order by stop_sequence
    """
    df1 = dbconnect.makeQuery(s1, output='df')

    df2 = df1[['stop_sequence']].copy()
    df2['space_id'] = space_id
    df2['trip_id'] = trip_id
    df2['id'] = cf.assignUID(df1)
    df2['arrival_time'] = None
    df2.at[0,'arrival_time'] = start_time

    # to do: populate remaining arrival times also, taking a default speed
    # and calculating lat-long distance / routed distance

    status1 = dbconnect.execSQL(i1)
    status2 = dbconnect.addTable(df2, 'stop_times')

    returnD = { "message": "success"}
    returnD['trip_id'] = trip_id
    returnD['added_stop_times'] = len(df2)

    return returnD


################

def updateTimingsForPattern(pattern_id, pattern_length):
    # to do: if a pattern's length has changed, then update timings entries for it
    space_id = int(os.environ.get('SPACE_ID',1))
    totalAdded = totalRemoved = 0

    # find all trips for the pattern
    s1 = f"""select id from trips
    where space_id = {space_id}
    and pattern_id = '{pattern_id}'
    """
    tripsList = dbconnect.makeQuery(s1, output='column')

    if not len(tripsList):
        return len(tripsList), totalAdded, totalRemoved

    all_delIds = []
    all_df_new = []
    for trip_id in tripsList:
        # get existing
        cf.logmessage(f"trip_id: {trip_id}")
        space_id = int(os.environ.get('SPACE_ID',1))
        s1 = f"""select id, stop_sequence from stop_times
        where space_id = {space_id}
        and trip_id = '{trip_id}'
        order by stop_sequence
        """
        df_exist = dbconnect.makeQuery(s1, output='df', keepCols=True)
        
        if len(df_exist) == pattern_length:
            # no change needed!
            continue
        
        elif len(df_exist) > pattern_length:
            # delete flow
            delIds = df_exist[pattern_length:]['id'].tolist()
            # cf.logmessage("ids to delete:",delIds)
            if len(delIds): all_delIds += delIds
            # delIdsSQL = cf.quoteNcomma(delIds)
            # d1 = f"""delete from stop_times
            # where id in ({delIdsSQL})
            # """
            # d1Count = dbconnect.execSQL(d1)
            # totalRemoved += d1Count

        else:
            # add flow
            newSeq = list(range(len(df_exist)+1, pattern_length+1))
            df_new = pd.DataFrame({'stop_sequence':newSeq})
            df_new['id'] = cf.assignUID(df_new)
            df_new['space_id'] = space_id
            df_new['trip_id'] = trip_id
            # tstatus1 = dbconnect.addTable(df_new, 'stop_times')
            # totalAdded += len(df_new)
            all_df_new.append(df_new)

    
    # delete at once
    if len(all_delIds):
        delIdsSQL = cf.quoteNcomma(all_delIds)
        cf.logmessage(f"ids to delete: {all_delIds}")
        d1 = f"""delete from stop_times
        where id in ({delIdsSQL})
        """
        totalRemoved = dbconnect.execSQL(d1)
    

    # add at once
    if len(all_df_new):
        add_df = pd.concat(all_df_new, sort=False, ignore_index=True)
        print("add_df:")
        print(add_df)
        totalAdded = dbconnect.addTable(add_df, 'stop_times')

    return len(tripsList), totalAdded, totalRemoved 