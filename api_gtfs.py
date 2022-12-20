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

    # stops
    if stopdf:
        stopdf['zap'] = stopdf['stop_name'].apply(zapper)

    return {"filename": file1.filename, "name": groupName}





#############################
# Background task of creating GTFS



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

    token = cf.makeUID(4) # creating a token to uniquely tag this GTFS creation process
    
    # starting off background task and then finishing the api call without waiting for that task to complete
    # from https://fastapi.tiangolo.com/tutorial/background-tasks/
    background_tasks.add_task(createGTFS, token, req.depotsList, space_id)

    returnD = { "message": "started in background", "started": True , "token": token }
    if age: returnD["time_since_last"] = age
    return returnD


@app.get("/API/createGTFS_status", tags=["gtfs"])
def createGTFS_status():
    cf.logmessage("createGTFS_status api call")
    returnD = {"message":"success", "tasks": []}

    s1 = f"""select details, last_updated from tasks where name='createGTFS' order by last_updated desc
    """
    tasksList = dbconnect.makeQuery(s1, output='list')
    tcollector = []
    for t in tasksList:
        row = t['details'] # will be a dict
        row['last_updated'] = cf.makeTimeString(t['last_updated'])
        tcollector.append(row)
    returnD['tasks'] =tcollector
    return returnD


######################3
# Functions

def checkTasks(taskName='createGTFS', limit=10):
    s1 = f"""select age from (
    select EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated)) AS age from tasks 
    where running='true'
    and name = '{taskName}'
    order by last_updated desc
    ) as t1 where age <= {limit * 60}
    """
    runningTaskAges = dbconnect.makeQuery(s1, output='column')
    if not len(runningTaskAges): return True,0

    # if there is at least one recent running task, then give its age
    return False, runningTaskAges[0]


def updateStatus(token, updates, space_id):
    s1 = f"select details from tasks where id = '{token}'"
    detailsD = dbconnect.makeQuery(s1, output='oneValue', noprint=True)


    if not detailsD:
        # new task
        i1 = f"""insert into tasks (id, space_id, name, last_updated, running, details) values (
        '{token}',{space_id},'createGTFS',CURRENT_TIMESTAMP, 'true', '{json.dumps(updates)}' )
        """
        i1Count = dbconnect.execSQL(i1, noprint=True)

    else:
        detailsD.update(updates)
        uVals = ["last_updated = CURRENT_TIMESTAMP", f"details = '{json.dumps(detailsD)}'"]
        if not updates.get('running',True): uVals.append(f"running = 'false'")

        u1 = f"""update tasks
        set {','.join(uVals)}
        where id = '{token}'
        """
        u1Count = dbconnect.execSQL(u1, noprint=True)
    return


def createGTFS(token, depotsList, space_id):
    # to do : block if existing task is running -> do that from the api call

    tstart = time.time()
    # output GTFS to be stored somewhere
    gtfsFolder = os.path.join(outputFolder, f"gtfs_{token}")
    os.makedirs(gtfsFolder, exist_ok=True)

    cf.logmessage(f"Background task: createGTFS token: {token}, outputFolder: {gtfsFolder}")
    ts = cf.getTime()
    updates = {'token':token, 'running':True, 'depots': depotsList, 'started_at':ts}
    updateStatus(token, updates, space_id) # call this function whenever some step is done.
    
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
    updates = {'agency.txt':ts}
    updateStatus(token, updates, space_id)

    # calendar.txt
    # take the one in configD settings only for now.
    crow = { "service_id": configD.get('calendar_default_service_id','ALL'),
        "start_date": configD.get("calendar_default_start_date","20220101"),
        "end_date": configD.get("calendar_default_end_date","20270101")
    }
    days = configD.get("calendar_default_days","MTWTFSS")
    crow['monday'] = 1    if days[0].upper() == 'M' else 0
    crow['tuesday'] = 1   if days[1].upper() == 'T' else 0
    crow['wednesday'] = 1 if days[2].upper() == 'W' else 0
    crow['thursday'] = 1  if days[3].upper() == 'T' else 0
    crow['friday'] = 1    if days[4].upper() == 'F' else 0
    crow['saturday'] = 1  if days[5].upper() == 'S' else 0
    crow['sunday'] = 1    if days[6].upper() == 'S' else 0
    calenderdf = pd.DataFrame([crow])
    calenderdf.to_csv(os.path.join(gtfsFolder, 'calendar.txt'), index=False)
    ts = cf.getTime()
    updates = {'calendar.txt':ts}
    updateStatus(token, updates, space_id)

    # routes
    if len(depotsList):
        depotsSQL = f"and depot in ({cf.quoteNcomma(depotsList)})"
    else:
        depotsSQL = ""
    s1 = f"""select id as route_id, depot, name as route_short_name, description as route_desc from routes 
    where space_id={space_id} {depotsSQL}
    order by depot, name"""
    routes1df = dbconnect.makeQuery(s1,output='df')
    cf.logmessage(f"routes1df: {len(routes1df)} rows")
    routes1df['route_type'] = configD.get('gtfs_route_type','3')
    routes1df['agency_id'] = configD.get('agency_id', 'TSRTC')
    routes1df['depot'].replace(to_replace={'':'MISC'}, inplace=True)

    # provisionally save routes.txt
    routes1df.to_csv(os.path.join(gtfsFolder, 'routes.txt'), index=False)
    ts = cf.getTime()
    updates = {'routes.txt':ts, 'num_routes':len(routes1df)}
    updateStatus(token, updates, space_id)

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
    cf.logmessage(f"tripsdf1: {len(tripsdf1)} rows")

    # Handle where this is empty : meaning there are no patterns under these routes; quit
    if not len(tripsdf1):
        cf.logmessage(f"No pattern found under the {len(routes1df)} routes, can't make a GTFS")
        ts = cf.getTime()
        timeTaken = round(time.time()-tstart,2)
        updates = {'num_patterns':0, 'no_patterns':True, 'running':False, 'completed':True, 'timeTaken':timeTaken }
        updateStatus(token, updates, space_id)
        return

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
    cf.logmessage(f"patternsdf1: {len(patternsdf1)} rows")
    if not len(patternsdf1):
        # Handle where this is empty : meaning there are no patterns under these routes; quit
        cf.logmessage(f"No pattern with stops found under the {len(routes1df)} routes, can't make a GTFS")
        ts = cf.getTime()
        timeTaken = round(time.time()-tstart,2)
        updates = {'num_patterns':0, 'no_patterns':True, 'running':False, 'completed':True, 'timeTaken':timeTaken }
        updateStatus(token, updates, space_id)
        return
    else:
        ts = cf.getTime()
        updates = {'patterns':ts, 'num_patterns':len(patternsdf1)}
        updateStatus(token, updates, space_id)

    # get all stops used in the patterns
    allStops = patternsdf1['stop_id'].unique().tolist()
    allStopsSQL = cf.quoteNcomma(allStops)
    s1 = f"""select id as stop_id, name as stop_name, 
    ST_Y(geopoint::geometry) as stop_lat, ST_X(geopoint::geometry) as stop_lon 
    from stops_master where id in ({allStopsSQL})
    """
    stopsdf1 = dbconnect.makeQuery(s1, output='df')

    # how many unmapped
    unmapped = len(stopsdf1[stopsdf1['stop_lat']==''])
    if unmapped:
        # map them with default lat-long
        default_loc = configD.get('gtfs_default_loc').split(',')
        defaut_lat = float(default_loc[0])
        default_lon = float(default_loc[1])
        stopsdf1['stop_lat'].replace(to_replace={'':defaut_lat}, inplace=True)
        stopsdf1['stop_lon'].replace(to_replace={'':default_lon}, inplace=True)
    cf.logmessage(f"stopsdf1: {len(stopsdf1)} rows, {unmapped} unmapped")
    
    # save stops.txt
    stopsdf1.to_csv(os.path.join(gtfsFolder, 'stops.txt'), index=False)
    ts = cf.getTime()
    updates = {'stops.txt':ts, 'num_stops':len(stopsdf1), 'unmapped_stops':unmapped}
    updateStatus(token, updates, space_id)
    message = f"{len(stopsdf1)} stops"
    if unmapped: message += f", {unmapped} of them unmapped (and assumed a default lat-long"
    cf.logmessage(message)


    # get all timings
    tripsListSQL = cf.quoteNcomma([x for x in tripsdf1['trip_id'].tolist() if len(x) > 0 ] )
    if not len(tripsListSQL.strip()):
        cf.logmessage(f"No trip ids for given routes")
        if configD['gtfs_default_tripPerPattern'].upper() == 'Y':
            makeTrip = True
            cf.logmessage("gtfs_default_tripPerPattern = Y so proceeding with creating dummy trips for each pattern")
        else:
            cf.logmessage(f"gtfs_default_tripPerPattern != Y and no valid trips, so cannot proceed with making GTFS")
            ts = cf.getTime()
            timeTaken = round(time.time()-tstart,2)
            updates = {'num_trips':0, 'no_timings':True, 'running':False, 'completed':True, 'timeTaken':timeTaken }
            updateStatus(token, updates, space_id)
            return

    else:
        s1 = f"""select trip_id, stop_sequence, arrival_time, departure_time from stop_times
        where trip_id in ({tripsListSQL})
        order by trip_id, stop_sequence
        """
        timingsdf1 = dbconnect.makeQuery(s1, output='df')

        # populate departure_time wherever blank with same value as arrival_time
        def departurePopulate(x):
            if not x['departure_time']:
                if x['arrival_time']:
                    return x['arrival_time']
                else:
                    return ''
            else:
                return x['departure_time']

        timingsdf1['departure_time'] = timingsdf1.apply(lambda x: departurePopulate(x) , axis=1)


    # merge stops into patternsdf1
    patternsdf2 = pd.merge(patternsdf1,stopsdf1, how='left',on='stop_id')

    # loop thru each trip, combine pattern and timings table
    stopTimesArr = []
    tripsdf1['include'] = 1
    makeTripCount = 0
    calculatedTimings = 0
    cf.logmessage(f"Processing {len(tripsdf1)} trips for trips and stop_times")
    
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
            # check: this should only happen if there's valid timingsdf1 data to start with
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
            makeTripCount += 1
        
        if len(patternsdf3) != len(timingsdf2): 
            cf.logmessage(f"Warning: inconsistent lengths for pattern {tr['pattern_id']} {len(tr['pattern_id'])}, trip {tr['trip_id']} {len(tr['trip_id'])}")
        
        # do stop times
        st2df = pd.merge(patternsdf3, timingsdf2, how='left', on='stop_sequence')
        # get shape_dist_traveled
        # st2df = pd.merge(st1df, stopsdf1[['stop_id','stop_lat','stop_lon']], on='stop_id',how='left')
        cf.computeDistance(st2df)


        # put proper time format
        st2df['arrival_time'] = st2df['arrival_time'].apply(cf.timeFormat)
        st2df['departure_time'] = st2df['departure_time'].apply(cf.timeFormat)

        # timepoint
        st2df['timepoint'] = '0' # approx by default; change to 1 if its a user-entered time value

        # interpolate timings
        if configD.get('gtfs_default_calcTimings').upper() == 'Y':
            try:
                speed = float(configD.get('gtfs_default_speed','20'))
            except:
                logmessage(f"Warning: invalid gtfs_default_speed value, assuming 20 km/hr")
                speed = 20
            for N in range(1,len(st2df)):
                prev = st2df.at[N-1,'departure_time']

                if cf.timeFormat(st2df.at[N,'departure_time']) and (not cf.timeFormat(st2df.at[N,'arrival_time'])):
                    # edge case: if departure time is populated but not arrival time
                    st2df.at[N,'arrival_time'] = st2df.at[N,'departure_time']
                
                elif not cf.timeFormat(st2df.at[N,'arrival_time']):
                    # if arrival time isn't populated
                    journeyTime = round(st2df.at[N,'ll_dist']/speed*3600)
                    st2df.at[N,'arrival_time'] = cf.timeAdd(prev,journeyTime)
                    calculatedTimings += 1
                    st2df.at[N,'departure_time'] = st2df.at[N,'arrival_time']
                    # for now we are assuming departure_time to be same as arrival_time only when calculating
                else:
                    st2df.at[N,'timepoint'] = '1' # arrival time is user-entered, so keep timepoint as 1 for this
                    if not cf.timeFormat(st2df.at[N,'departure_time']):
                        # if arrival time is populated but just departure time is not
                        st2df.at[N,'departure_time'] = st2df.at[N,'arrival_time']

                # TO DO: In case of user-entered times, calc speed and flag if too high
        
        # print(st2df)
        stopTimesArr.append(st2df)
        
        if (N+1)%50 == 0: 
            updates = { 'trips_processed': N+1 }
            updateStatus(token, updates, space_id)
            cf.logmessage(f"Processed {N+1} trips")

    # excluded trips
    excludedTrips = len(tripsdf1[tripsdf1['include']==0])
    
    # make final trips.txt
    tripCols = ['route_id','service_id','trip_id','direction_id','block_id']
    tripsdf2 = tripsdf1[tripsdf1['include']==1]
    tripsdf2[tripCols].to_csv(os.path.join(gtfsFolder, 'trips.txt'), index=False)
    ts = cf.getTime()
    updates = {'trips.txt':ts, 'num_trips':len(tripsdf2), 'excludedTrips':excludedTrips, 'createdTrips':makeTripCount}
    updateStatus(token, updates, space_id)

    # stop_times
    st3df = pd.concat(stopTimesArr, sort=False, ignore_index=True )
    stopTimesCols = ['trip_id','arrival_time','departure_time','stop_id','stop_sequence', 'timepoint']
    st3df[stopTimesCols].to_csv(os.path.join(gtfsFolder, 'stop_times.txt'), index=False)
    # st3df.to_csv(os.path.join(gtfsFolder, 'stop_times.txt'), index=False)

    ts = cf.getTime()
    updates = {'stop_times.txt':ts, 'num_stop_times':len(st3df), 'calculatedTimings':calculatedTimings }
    updateStatus(token, updates, space_id)

    # create GTFS zip
    zf = zipfile.ZipFile(os.path.join(gtfsFolder,f"gtfs_{token}.zip"), "w", zipfile.ZIP_DEFLATED)
    zf.write(os.path.join(gtfsFolder, 'agency.txt'), arcname='agency.txt')
    zf.write(os.path.join(gtfsFolder, 'calendar.txt'), arcname='calendar.txt')
    zf.write(os.path.join(gtfsFolder, 'routes.txt'), arcname='routes.txt')
    zf.write(os.path.join(gtfsFolder, 'stops.txt'), arcname='stops.txt')
    zf.write(os.path.join(gtfsFolder, 'trips.txt'), arcname='trips.txt')
    zf.write(os.path.join(gtfsFolder, 'stop_times.txt'), arcname='stop_times.txt')
    zf.close()

    # done; close it
    timeTaken = round(time.time()-tstart,2)
    ts = cf.getTime()
    updates = {'running':False, 'completed':True, 'timeTaken':timeTaken}
    updateStatus(token, updates, space_id)

    cf.logmessage(f"Background task of token {token} complete in {timeTaken}secs. GTFS in {gtfsFolder}")

