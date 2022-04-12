# api_config.py

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

class loadConfig_payload(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None
    depotFlag: Optional[bool] = False

@app.post("/API/loadConfig", tags=["config"]) 
def loadconfig(req: loadConfig_payload):
    cf.logmessage("loadConfig api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    s1 = f"""select config_key, config_value from config
    where space_id = {space_id}"""
    df = dbconnect.makeQuery(s1, output='df')
    returnD = { 'message': "success"}
    configD = {}
    if len(df):
        for r in df.to_dict(orient='records'):
            configD[r['config_key']] = r['config_value']
    returnD['config'] = configD
    
    if req.depotFlag:
        s2 = f"select distinct depot from routes where space_id={space_id} and depot is not null and depot != '' "
        returnD['depots'] = dbconnect.makeQuery(s2, output='column')
    
    return returnD


class saveConfig_payload_single(BaseModel):
    key: Optional[str] = None
    value: Optional[str] = None

class saveConfig_payload(BaseModel):
    data: List[saveConfig_payload_single]

@app.post("/API/saveConfig", tags=["config"]) 
def saveConfig(req: saveConfig_payload):
    cf.logmessage("saveConfig api call")
    space_id = int(os.environ.get('SPACE_ID',1))

    # convert request body to json array, from https://stackoverflow.com/a/60845064/4355695
    requestArr = [t.__dict__ for t in req.data ]
    # print(requestArr)
    dfnew = pd.DataFrame(requestArr)
    if not len(dfnew):
        raise HTTPException(status_code=400, detail="Nothing to save")

    # fetch existing configs
    s1 = f"""select config_key, config_value, id from config
    where space_id = {space_id}"""
    dfold = dbconnect.makeQuery(s1, output='df', fillna=True, keepCols=True).set_index('config_key')
    oldConfigs = dfold.to_dict(orient='index')

    print(oldConfigs)
    print(dfnew)

    returnD = { 'message': "success", "updates":0, "new":0}
    for N, row in dfnew.iterrows():

        if row['key'] in oldConfigs.keys():
            if row['value'] != oldConfigs[row['key']]['config_value']:
                u1 = f"""update config
                set config_value = '{row['value']}',
                last_updated = CURRENT_TIMESTAMP
                where space_id = '{space_id}'
                and id = '{oldConfigs[row['key']]['id']}'
                """
                u1Count = dbconnect.execSQL(u1)
                returnD['updates'] += u1Count
            else:
                cf.logmessage(f"{row['key']} has same value {row['value']} so not replacing.");
        else:
            newId =  cf.makeUID()
            i1 = f"""insert into config (id, space_id, config_key, config_value, created_on, last_updated)
            values ('{newId}', {space_id}, '{row['key']}','{row['value']}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            i1Count = dbconnect.execSQL(i1)
            returnD['new'] += i1Count
    

    return returnD
