# dbonnect.py

import psycopg2, json, sys, os, time, datetime
from psycopg2 import pool
import pandas as pd

# import commonfuncs as cf

# Postgresql multi-threaded connection pool.
# From https://pynative.com/psycopg2-python-postgresql-connection-pooling/#h-create-a-threaded-postgresql-connection-pool-in-python

dbcreds = json.load(open('credentials.json','r'))
threaded_postgreSQL_pool = psycopg2.pool.ThreadedConnectionPool(5, 20, user=dbcreds['user'],
    password=dbcreds['password'], host=dbcreds['host'], port=dbcreds['port'], database=dbcreds['dbname'])

assert threaded_postgreSQL_pool, "Could not create DB connection"

def makeQuery(s1, output='df', lowerCaseColumns=True, keepCols=False, fillna=True, engine=None, noprint=False):
    '''
    output choices:
    oneValue : ex: select count(*) from table1 (output will be only one value)
    oneRow : ex: select * from table1 where id='A' (output will be onle one row)
    df: ex: select * from users (output will be a table)
    list: json array, like df.to_dict(orient='records')
    column: first column in output as a list. ex: select username from users
    oneJson: First row, as dict
    '''
    if not isinstance(s1,str):
        print("query needs to be a string")
        return False
    if ';' in s1:
        print("; not allowed")
        return False

    if not noprint:
        # keeping auth check and some other queries out
        skipPrint = ['where token=', '.STArea()', 'STGeomFromText']
        if not any([(x in s1) for x in skipPrint]) : 
            print(f"Query: {' '.join(s1.split())}")
        else: 
            print(f"Query: {' '.join(s1.split())[:20]}")

    ps_connection = threaded_postgreSQL_pool.getconn()

    result = None # default return value

    if output in ('oneValue','oneRow'):
        ps_cursor = ps_connection.cursor()
        ps_cursor.execute(s1)
        row = ps_cursor.fetchone()
        if output == 'oneValue':
            result = row[0]
        else:
            result = row
        ps_cursor.close()
        
    elif output in ('df','list','oneJson','column'):
        # df
        if fillna:
            df = pd.read_sql_query(s1, con=ps_connection, coerce_float=False).fillna('') 
        else:
            df = pd.read_sql_query(s1, con=ps_connection, coerce_float=False)
        # coerce_float : need to ensure mobiles aren't screwed
        
        # make all colunm headers lowercase
        if lowerCaseColumns: df.columns = [x.lower() for x in df.columns] # from https://stackoverflow.com/questions/19726029/how-can-i-make-pandas-dataframe-column-headers-all-lowercase
        
        if (output=='df') and (not len(df)) and (not keepCols):
            result = []
        elif (not len(df)): 
            result = []
        elif output == 'column':
            result = df.iloc[:,0].tolist() # .iloc[:,0] -> first column
        elif output == 'list':
            result = df.to_dict(orient='records')
        elif output == 'oneJson':
            result = df.to_dict(orient='records')[0]
        else:
            # default - df
            result = df
    else:
        print('invalid output type')
    
    threaded_postgreSQL_pool.putconn(ps_connection) # return threaded connnection back to pool
    return result


def execSQL(s1):
    ps_connection = threaded_postgreSQL_pool.getconn()
    ps_cursor = ps_connection.cursor()
    ps_cursor.execute(s1)
    affected = ps_cursor.rowcount
    
    ps_cursor.close()
    threaded_postgreSQL_pool.putconn(ps_connection)
    return affected
