# Payanam

## Setup
```
pip install fastapi uvicorn[standard] psycopg2-binary pandas
```

## Run
```
uvicorn payanam_launch:app --port 5500 --reload
```

Deploy on server:
if deploying under a folder path under main host, use --root-path :
```
nohup uvicorn payanam_launch:app --port 5500 --root-path /payanam &
```

Will start application on port 8000, http://localhost:8000/


### Swagger/OpenAPI docs

http://localhost:8000/docs

