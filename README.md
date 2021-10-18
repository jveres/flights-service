# flights-service

Based on the [nycflights13](https://users.dimi.uniud.it/~massimo.franceschet/ds/plugandplay/sqlite/sqlite.html) public dataset. Provides streaming event source API endpoint of scheduled departures from NYC airport. Usable for testing server sent events. Uses the awesome [Puspin](https://pushpin.org) proxy server and [Sqlite](https://sqlite.org) database embedded.

## Bundle, compress and compile source into x86_64 Linux binary:
```sh
deno bundle --unstable flights.ts flights.js
terser --compress --mangle --output flights.min.js -- flights.js
deno compile -A --unstable --no-check --target x86_64-unknown-linux-gnu --output flights-x86_64-unknown-linux-gnu flights.min.js
```
## Build and run as container image:
```sh
docker build -t flights-service .
docker run -p 7999:7999 flights-service
```
![Terminal output!](/images/term.png)
![Browser page!](/images/browser.png)
## Available APIs
### GET http://localhost:7999/schedule
#### Headers:
#### - `"accept": "text/html"`
#### Returns a test HTML page. useful for checking if everything works as expected.

### GET http://localhost:7999/schedule
#### Query parameters:
#### - `last-known-id=[number]`
#### Headers:
#### - `"accept": "application/json"`
#### Returns daliy schedule as json.

### GET http://localhost:7999/schedule
#### Query parameters:
#### - `last-known-id=[number]`
#### Headers:
#### - `"accept": "text/event-stream"`
#### Returns daliy schedule in the form of server sent events. Updates are streamed realtime.

## SQL schema
```sql
CREATE TABLE airlines (
 carrier VARCHAR(2),
 name VARCHAR(60),
 primary key (carrier)
);
CREATE TABLE airports (
 faa VARCHAR(3),
 name VARCHAR(60),
 lat REAL,
 lon REAL,
 alt INTEGER,
 tz INTEGER,
 dst VARCHAR(1),
 tzone VARCHAR(60),
 primary key (faa)
);
CREATE TABLE planes (
 tailnum VARCHAR(10),
 year INTEGER,
 type VARCHAR(30),
 manufacturer VARCHAR(30),
 model VARCHAR(30),
 engines INTEGER,
 seats INTEGER,
 speed INTEGER,
 engine VARCHAR(30),
 primary key (tailnum)
);
CREATE TABLE weather (
 id BIGINT, -- big integer
 origin VARCHAR(3),
 year INTEGER,
 month INTEGER,
 day INTEGER,
 hour INTEGER,
 temp REAL,
 dewp REAL,
 humid REAL,
 wind_dir REAL,
 wind_speed REAL,
 wind_gust REAL,
 precip REAL,
 pressure REAL,
 visib REAL,
 time_hour REAL,
 primary key (id),
 foreign key (origin) references airports(faa)
);
CREATE TABLE flights (
 id BIGINT, -- big integer
 year INTEGER,
 month INTEGER,
 day INTEGER,
 dep_time INTEGER,
 sched_dep_time INTEGER,
 dep_delay INTEGER,
 arr_time INTEGER,
 sched_arr_time INTEGER,
 arr_delay INTEGER,
 carrier VARCHAR(2),
 flight INTEGER,
 tailnum VARCHAR(10),
 origin VARCHAR(3),
 dest VARCHAR(3),
 air_time INTEGER,
 distance INTEGER,
 hour INTEGER,
 minute INTEGER,
 time_hour REAL,
 primary key (id),
 foreign key (carrier) references airlines(carrier),
 foreign key (tailnum) references planes(tailnum),
 foreign key (origin) references airports(faa),
 foreign key (dest) references airports(faa)
);
CREATE UNIQUE INDEX airlines_index on airlines(carrier);
CREATE UNIQUE INDEX airports_index on airports(faa);
CREATE UNIQUE INDEX planes_index on planes(tailnum);
CREATE UNIQUE INDEX weather_index on weather(id);
CREATE UNIQUE INDEX flights_index on flights(id);
CREATE INDEX flights_tailnum on flights(tailnum);
CREATE INDEX flights_origin on flights(origin);
CREATE INDEX flights_dest on flights(dest);
CREATE INDEX flights_carrier on flights(carrier);
```