# flights-service

This demo service makes use of the [Airlines On-Time Performance](https://www.transtats.bts.gov/Tables.asp?QO_VQ=EFD&QO_anzr=Nv4yv0r%FDb0-gvzr%FDcr4s14zn0pr%FDQn6n&QO_fu146_anzr=b0-gvzr) public dataset provided by Bureau of Transportation Statistics. 

## Bundle, compress and compile source into x86_64 Linux binary:
```sh
deno bundle httpserver.ts httpserver.js
deno compile --allow-read --allow-net --allow-env --no-check --target x86_64-unknown-linux-gnu --output httpserver-x86_64-unknown-linux-gnu httpserver.js
```
## Build and run as container image:
```sh
docker build --platform linux/amd64 -t flights-service . 
docker run -p 7999:7999 flights-service
```
## Available APIs
### GET http://localhost:7999/
#### Returns a test HTML page. Useful for checking if everything works as expected.

### GET http://localhost:7999/schedule
#### Query parameters:
#### - `last-known-id=[number]`
#### Returns daily schedule as json data.

### GET http://localhost:7999/stream
#### Query parameters:
#### - `last-known-id=[number]`
#### Returns daily schedule in the form of server sent events. Updates are streaming realtime.

## SQL schema
```sql
CREATE TABLE flights (ID INTEGER PRIMARY KEY, FL_DATE DATE, ORIGIN TEXT, ORIGIN_CITY_NAME TEXT, DEST TEXT, DEST_CITY_NAME TEXT, CRS_DEP_TIME TEXT, DEP_TIME TEXT, DEP_DELAY TEXT, CRS_ARR_TIME TEXT, ARR_TIME INTEGER, ARR_DELAY INTEGER, TAIL_NUM TEXT, OP_CARRIER TEXT, OP_CARRIER_FL_NUM TEXT);
```