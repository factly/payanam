#commonfuncs.py
import json, os, time, datetime, uuid
import pandas as pd

root = os.path.dirname(__file__)
print(root)
timeOffset = 5.5
maxThreads = 8

logFolder = os.path.join(root,'logs')
os.makedirs(logFolder, exist_ok=True)


def logmessage( *content ):
    global timeOffset
    timestamp = '{:%Y-%m-%d %H:%M:%S} :'.format(datetime.datetime.utcnow() + datetime.timedelta(hours=timeOffset)) # from https://stackoverflow.com/a/26455617/4355695
    line = ' '.join(str(x) for x in list(content)) # from https://stackoverflow.com/a/3590168/4355695
    print(line) # print to screen also
    with open(os.path.join(logFolder,'log.txt'), 'a') as f:
        print(timestamp, line, file=f) # file=f argument at end writes to file. from https://stackoverflow.com/a/2918367/4355695

def makeError(message):
    logmessage(message)
    return 400, json.dumps({"status":"error","message":message}, default=str)

def makeSuccess(returnD={}):
    returnD['status'] = 'success'
    return 200, json.dumps(returnD, default=str)


def makeTimeString(x, offset=5.5, format="all"):
    '''
    format values: all, time, date
    '''
    # print(type(x))
    if isinstance(x, pd._libs.tslibs.nattype.NaTType) : return ''
    
    if isinstance(x, (pd._libs.tslibs.timestamps.Timestamp,datetime.datetime, datetime.date) ):
        if format == 'time':
            return (x + datetime.timedelta(hours=offset)).strftime('%H:%M:%S')
        elif format == 'date':
            return (x + datetime.timedelta(hours=offset)).strftime('%Y-%m-%d')
        else:
            # default: all
            return (x + datetime.timedelta(hours=offset)).strftime('%Y-%m-%d %H:%M')
    else:
        return ''


def quoteNcomma(a):
    # turn array into sql IN query string: 'a','b','c'
    holder = []
    for n in a:
        holder.append("'{}'".format(n))
    return ','.join(holder)


def keyedJson(df, key='trainNo'):
    arr = df.to_dict(orient='records')
    keysList = sorted(df[key].unique().tolist())
    returnD = {}
    for keyVal in keysList:
        returnD[keyVal] = df[df[key]==keyVal].to_dict(orient='records')
    return returnD
    

def IRdateConvert(x):
    # sample: "26 Feb 2021", "4 Mar 2021", "-"
    if x == '-': return None
    x2 = datetime.datetime.strptime(x, '%d %b %Y').strftime('%Y-%m-%d')
    return x2


def parseParams(url):
    # from https://stackoverflow.com/a/5075477/4355695
    parsed = urlparse.urlparse(url)
    return parse_qs(parsed.query)


def makeUID(nobreaks=False):
    if nobreaks:
        return uuid.uuid4().hex
    else:
        return str(uuid.uuid4())

def getDate(timeOffset=5.5, daysOffset=0, returnObj=False):
    d = datetime.datetime.utcnow().replace(microsecond=0) + datetime.timedelta(hours=timeOffset) + datetime.timedelta(days=daysOffset)
    if returnObj: return d
    return d.strftime('%Y-%m-%d')

def getTime(timeOffset=5.5, secsOffset=0, returnObj=False):
    d = datetime.datetime.utcnow().replace(microsecond=0) + datetime.timedelta(hours=timeOffset) + datetime.timedelta(seconds=secsOffset)
    if returnObj: return d
    return d.strftime('%Y-%m-%d %H:%M:%S')