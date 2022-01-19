FROM python:3.9

WORKDIR /code

# expose port number
EXPOSE 5500

COPY ./requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY . /code

CMD ["uvicorn","payanam_launch:app", "--host", "0.0.0.0", "--port", "5500"]
