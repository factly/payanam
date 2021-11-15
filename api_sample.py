from typing import Optional

from payanam_launch import app


@app.get("/hello")
async def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
async def read_item(item_id: int, q: Optional[str] = None):
    return {"item_id": item_id, "q": q}
    # example: http://localhost:8000/items/3?q=hello


@app.get("/ola")
async def read_root():
    return {"Ola": "Monde"}

