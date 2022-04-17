# api_gtfs.py

import os, time, json, datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi.responses import FileResponse
from fastapi import HTTPException, Header, File, UploadFile, Form, BackgroundTasks
import pandas as pd
import zipfile, io

from payanam_launch import app
import commonfuncs as cf
import dbconnect

###############
root = os.path.dirname(__file__)
outputFolder = os.path.join(root,'output')
os.makedirs(outputFolder, exist_ok=True)

###############

# uploading files
# https://fastapi.tiangolo.com/tutorial/request-files/
# 

@app.post("/API/uploadGTFS", tags=["gtfs"])
def uploadGTFS(
        file1: UploadFile = File(...),
        depot: Optional[str] = Form(None),
        import_agency: Optional[bool] = Form(None)

        # depotsIncluded: Optional[bool] = Form(False)
    ):
    contents = file1.file.read()
    groupName = file1.filename.replace('.zip','')
    cf.logmessage(len(contents), groupName)
    with zipfile.ZipFile(io.BytesIO(contents)) as z:
        gtfsFiles = z.namelist()
        if 'agency.txt' in gtfsFiles:
            agencydf = pd.read_csv(io.BytesIO(z.read('agency.txt')))
        else:
            agencydf = None
        
        if 'routes.txt' in gtfsFiles:
            routedf = pd.read_csv(io.BytesIO(z.read('routes.txt')))
        else:
            routedf = None

        if 'trips.txt' in gtfsFiles:
            tripdf = pd.read_csv(io.BytesIO(z.read('trips.txt')))
        else:
            tripdf = None

        if 'stop_times.txt' in gtfsFiles:
            stop_timedf = pd.read_csv(io.BytesIO(z.read('stop_times.txt')))
        else:
            stop_timedf = None

        if 'stops.txt' in gtfsFiles:
            stopdf = pd.read_csv(io.BytesIO(z.read('stops.txt')))
        else:
            stopdf = None

        if 'calendar.txt' in gtfsFiles:
            calendardf = pd.read_csv(io.BytesIO(z.read('calendar.txt')))
        else:
            calendardf = None

    # ok out of the zip opening
    if depot: depotName = depot
    else: depotName = groupName

    # TO DO: Validation

    # 

    return {"filename": file1.filename, "name": groupName}





#############################
# Background task of creating GTFS

def updateStatus(token, updates):
    taskFile = os.path.join(outputFolder,'task_status.json')
    if os.path.isfile(taskFile):
        taskD = json.load(open(taskFile,'r'))
    else: taskD = {}
    if not taskD.get('createGTFS',False):
        taskD['createGTFS'] = {}

    if not taskD['createGTFS'].get(token,False):
        taskD['createGTFS'][token] = {}

    taskD['createGTFS'][token].update(updates)
    json.dump(taskD, open(taskFile,'w'),indent=2)
    return


def createGTFS(token, depotsList, space_id):
    # to do : block if existing task is running -> do that from the api call

    tstart = time.time()
    # output GTFS to be stored somewhere
    gtfsFolder = os.path.join(outputFolder, f"gtfs_{token}")
    os.makedirs(gtfsFolder, exist_ok=True)

    cf.logmessage(f"Background task: createGTFS token: {token}, outputFolder: {gtfsFolder}")
    ts = cf.getTime()
    updates = {'running':True, 'started_at':ts, 'last_updated': ts}
    updateStatus(token, updates) # call this function whenever some step is done.
    
    # fetch configs
    s1 = f"select config_key, config_value from config where space_id={space_id}"
    configList = dbconnect.makeQuery(s1, output='list')
    configD = {}
    for c in configList:
        configD[c['config_key']] = c['config_value']

    # agency
    agencydf = pd.DataFrame([{
        'agency_id': configD.get('agency_id', 'TSRTC'),
        "agency_name": configD.get("agency_name","Telangana State Road Transport Corporation"),
        "agency_url": configD.get("agency_url",''),
        "agency_timezone": configD.get("agency_timezone","Asia/Kolkata"),
        "agency_lang": configD.get("agency_lang",'en')
    }])

    agencydf.to_csv(os.path.join(gtfsFolder,'agency.txt'),index=False)

    ts = cf.getTime()
    updates = {'last_updated': ts, 'agency.txt':ts}
    updateStatus(token, updates)

    # routes
    if len(depotsList):
        depotsSQL = f"and depot in ({cf.quoteNcomma(depotsList)})"
    else:
        depotsSQL = ""
    s1 = f"""select id as route_id, depot, name as route_short_name, description as route_desc from routes 
    where space_id={space_id} {depotsSQL}
    order by depot, name"""
    routes1df = dbconnect.makeQuery(s1,output='df')
    routes1df['route_type'] = configD.get('gtfs_route_type','3')
    routes1df['agency_id'] = configD.get('agency_id', 'TSRTC')
    routes1df['depot'].replace(to_replace={'':'MISC'}, inplace=True)

    # trips, thru patterns
    routeIdsSQL = cf.quoteNcomma(routes1df['route_id'].tolist())
    s1 = f"""select t2.name as pattern_name, t2.route_id, t2.id as pattern_id,
    t1.id as trip_id, t1.name as trip_name, t1.block_id
    from patterns as t2
    left join  trips as t1
    on t1.pattern_id = t2.id
    where t2.route_id in ({routeIdsSQL})
    """
    tripsdf1 = dbconnect.makeQuery(s1, output='df')
    tripsdf1['service_id'] = configD.get('calendar_default_service_id','ALL')
    tripsdf1['direction_id'] = ''
    def assignDir(x):
        if 'DOWN' in x.upper():
            return '1'
        else:
            return '0'
    tripsdf1['direction_id'] = tripsdf1['pattern_name'].apply(assignDir)

    # get pattern_stops data for each pattern
    patternIds = tripsdf1['pattern_id'].unique().tolist()
    patternIdsSQL = cf.quoteNcomma(patternIds)
    s1 = f"""select pattern_id, stop_id, stop_sequence from pattern_stops where pattern_id in ({patternIdsSQL})
    order by pattern_id, stop_sequence
    """
    patternsdf1 = dbconnect.makeQuery(s1, output='df')

    # get all stops used in the patterns
    allStops = patternsdf1['stop_id'].unique().tolist()
    allStopsSQL = cf.quoteNcomma(allStops)
    s1 = f"""select id as stop_id, name as stop_name, latitude, longitude from stops_master where id in ({allStopsSQL})
    """
    stopsdf1 = dbconnect.makeQuery(s1, output='df')

    # how many unmapped
    unmapped = len(stopsdf1[stopsdf1['latitude']==''])
    # map them with default lat-long
    default_loc = configD.get('gtfs_default_loc').split(',')
    defaut_lat = float(default_loc[0])
    default_lon = float(default_loc[1])
    stopsdf1['latitude'].replace(to_replace={'':defaut_lat}, inplace=True)
    stopsdf1['longitude'].replace(to_replace={'':default_lon}, inplace=True)

    # save stops.txt
    stopsdf1.to_csv(os.path.join(gtfsFolder, 'stops.txt'), index=False)
    ts = cf.getTime()
    updates = {'last_updated': ts, 'stops.txt':ts}
    updateStatus(token, updates)


    # get all timings
    tripsListSQL = cf.quoteNcomma([x for x in tripsdf1['trip_id'].tolist() if len(x) > 0 ] )
    s1 = f"""select trip_id, stop_sequence, arrival_time, departure_time from stop_times
    where trip_id in ({tripsListSQL})
    order by trip_id, stop_sequence
    """
    timingsdf1 = dbconnect.makeQuery(s1, output='df')

    # merge stops into patternsdf1
    patternsdf2 = pd.merge(patternsdf1,stopsdf1, how='left',on='stop_id')

    # loop thru each trip, combine pattern and timings table
    stopTimesArr = []
    tripsdf1['include'] = 1
    for N,tr in tripsdf1.iterrows():
        makeTrip = False
        patternsdf3 = patternsdf2[patternsdf2['pattern_id'] == tr['pattern_id']].copy().reset_index(drop=True)
        
        if not len(patternsdf3):
            cf.logmessage(f"No stops under pattern {tr['pattern_id']}, skipping it")
            tripsdf1.at[N,'include'] = 0
            continue
        
        if not tr['trip_id']:
            cf.logmessage(f"No trip under pattern_id {tr['pattern_id']}")
            if configD['gtfs_default_tripPerPattern'].upper() == 'Y':
                makeTrip = True
            else:
                tripsdf1.at[N,'include'] = 0
                continue
        
        else:
            timingsdf2 = timingsdf1[timingsdf1['trip_id'] == tr['trip_id']].copy().reset_index(drop=True)
        
        if not len(timingsdf2):
            cf.logmessage(f"No timings entries found for trip {tr['trip_id']} under pattern {tr['pattern_id']}")
            if configD['gtfs_default_tripPerPattern'].upper() == 'Y':
                makeTrip = True
            else:
                tripsdf1.at[N,'include'] = 0
                continue
        
        if makeTrip:
            trip_id = cf.makeUID()
            tripsdf1.at[N,'trip_id'] = trip_id
            timingCollector = []
            for seq in range(1, len(patternsdf3)+1):
                if seq == 1:
                    timerow = {'stop_sequence': seq, 'arrival_time': configD.get('gtfs_default_tripstart','10:00')}
                    timerow['departure_time'] = timerow['arrival_time']
                else:
                    timerow = {'stop_sequence': seq, 'arrival_time':'', 'departure_time':''}
                timingCollector.append(timerow)
            timingsdf2 = pd.DataFrame(timingCollector)
            timingsdf2['trip_id'] = trip_id
        
        if len(patternsdf3) != len(timingsdf2): 
            cf.logmessage(f"Warning: inconsistent lengths for pattern {tr['pattern_id']} {len(tr['pattern_id'])}, trip {tr['trip_id']} {len(tr['trip_id'])}")
        
        # do stop times
        st1df = pd.merge(patternsdf3, timingsdf2, how='left', on='stop_sequence')
        stopTimesArr.append(st1df)
        
        if (N+1)%100 == 0: cf.logmessage(f"Processed {N+1} trips")

    # excluded trips
    excludedTrips = len(tripsdf1[tripsdf1['include']==0])
    if excludedTrips > 0:
        ts = cf.getTime()
        updates = {'last_updated': ts, 'excludedTrips':excludedTrips}
        updateStatus(token, updates)

    # make final trips.txt
    tripCols = ['route_id','service_id','trip_id','direction_id','block_id']
    tripsdf1[tripsdf1['include']==1][tripCols].to_csv(os.path.join(gtfsFolder, 'trips.txt'), index=False)
    ts = cf.getTime()
    updates = {'last_updated': ts, 'trips.txt':ts}
    updateStatus(token, updates)

    st2df = pd.concat(stopTimesArr, sort=False, ignore_index=True )
    stopTimesCols = ['trip_id','arrival_time','departure_time','stop_id','stop_sequence']
    st2df[stopTimesCols].to_csv(os.path.join(gtfsFolder, 'stop_times.txt'), index=False)
    ts = cf.getTime()
    updates = {'last_updated': ts, 'stop_times.txt':ts}
    updateStatus(token, updates)

    # to do: calendar.txt

    ts = cf.getTime()
    updates = {'last_updated': ts, 'running':False}
    updateStatus(token, updates)

    cf.logmessage(f"Background task of token {token} complete in {round(time.time()-tstart,2)}secs. GTFS in {gtfsFolder}")
    

class createGTFS_payload(BaseModel):
    depotsList: List[str] = []

@app.post("/API/createGTFS", tags=["gtfs"])
def createGTFS_api(req: createGTFS_payload, background_tasks: BackgroundTasks):
    cf.logmessage("createGTFS api call")
    space_id = int(os.environ.get('SPACE_ID',1))
    depotsList = req.depotsList

    # check if already a GTFS op running; keep a timeout mins limit
    clearance, age = checkTasks(taskName='createGTFS', limit=10)
    
    if not clearance:
        return {"message": "not starting", "started": False, "age":age }

    token = cf.makeUID(3) # creating a token to uniquely tag this GTFS creation process
    background_tasks.add_task(createGTFS, token, req.depotsList, space_id)

    returnD = { "message": "started in background", "started": True , "token": token }
    if age: returnD["time_since_last"] = age
    return returnD


def checkTasks(taskName='createGTFS', limit=10):
    taskFile = os.path.join(outputFolder,'task_status.json')
    createGTFSarr = json.load(open(taskFile,'r')).get(taskName,{})
    if not len(list(createGTFSarr.keys())): return True,0

    queuedf1 = pd.DataFrame(createGTFSarr).transpose()[['running','last_updated']].rename_axis('token').reset_index(drop=False)
    if not len(queuedf1): return True,0
    
    queuedf2 = queuedf1[queuedf1['running']].copy().sort_values('last_updated',ascending=False).reset_index(drop=True)
    if not len(queuedf2): return True,0
    
    # so there is at least one still-running task. But it could be v.old and have errored out.
    # To handle that edge case:
    t1 = datetime.datetime.strptime(queuedf2['last_updated'].values[0], '%Y-%m-%d %H:%M:%S')
    timeOffset = 5.5
    age = cf.getTime(returnObj=True) - t1
    if age.total_seconds() < limit*60:
        cf.logmessage(f"{taskName}: still one task running and under {limit} mins since; not ok to run")
        return False, age.total_seconds()
    else:
        cf.logmessage(f"{taskName}: latest task running is over {limit} mins old, so assuming its crashed; ok to run")
        return True, age.total_seconds()
