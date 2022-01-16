# Payanam

## Setup
```
pip3 install -r requirements.txt
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

Will start application on port 5500, http://localhost:5500/


### Swagger/OpenAPI docs

http://localhost:5500/docs

