CREATE EXTENSION if not exists postgis;
CREATE EXTENSION if not exists postgis_topology;
CREATE EXTENSION if not exists fuzzystrmatch;


DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts(
    org_id INT NULL,
    space_id INT NOT NULL PRIMARY KEY,
    account_name VARCHAR(100) NULL,
    created_on TIMESTAMP(0) NULL,
    is_disabled boolean NULL
);



DROP TABLE IF EXISTS routes;
CREATE TABLE routes(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    depot VARCHAR(100) NULL,
    name VARCHAR(100) NULL,
    description VARCHAR(500) NULL,
    status VARCHAR(20) NULL,
    created_on TIMESTAMP(0) NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL,
    services TEXT NULL,
    route_group_id VARCHAR(10) NULL
);
CREATE INDEX routes_i1 ON routes (space_id);


DROP TABLE IF EXISTS patterns;
CREATE TABLE patterns(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    route_id VARCHAR(10) NULL,
    name VARCHAR(100) NULL,
    sequence SMALLINT NULL,
    description VARCHAR(500) NULL,
    is_disabled BOOLEAN NULL,
    headway_secs INT NULL,
    first_trip_start TIME(0) NULL,
    end_time TIME(0) NULL,
    created_on TIMESTAMP(0) NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL,
    CONSTRAINT patterns_c1 UNIQUE (route_id, sequence)
);
CREATE INDEX patterns_i1 ON patterns (space_id, route_id);



DROP TABLE IF EXISTS pattern_stops;
CREATE TABLE pattern_stops(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    pattern_id VARCHAR(10) NULL,
    stop_id VARCHAR(10) NULL,
    stop_sequence SMALLINT NULL,
    time_offset INT NULL,
    CONSTRAINT pattern_stops_c1 UNIQUE (id, stop_sequence)
);
CREATE INDEX pattern_stops_i1 ON pattern_stops (space_id, pattern_id);
CREATE INDEX pattern_stops_i2 ON pattern_stops (space_id, pattern_id, stop_sequence);



DROP TABLE IF EXISTS trips;
CREATE TABLE trips(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    pattern_id VARCHAR(10) NULL,
    name VARCHAR(100) NULL,
    start_time TIME(0) NULL,
    end_time TIME(0) NULL,
    days VARCHAR(100) NULL,
    block_id VARCHAR(10) NULL,
    service_id VARCHAR(10) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL
);
CREATE INDEX trips_i1 ON trips (space_id, pattern_id);



DROP TABLE IF EXISTS stop_times;
CREATE TABLE stop_times(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    trip_id VARCHAR(100) NULL,
    stop_sequence SMALLINT NULL,
    arrival_time VARCHAR(8) NULL,
    departure_time VARCHAR(8) NULL,
    timepoint BOOLEAN NULL
);
CREATE INDEX stop_times_i1 ON stop_times (space_id, trip_id, stop_sequence);



DROP TABLE IF EXISTS services;
CREATE TABLE services(
    space_id INT,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    name VARCHAR(100),
    depot VARCHAR(100) NULL
);


DROP TABLE IF EXISTS stops_master;
CREATE TABLE stops_master(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(500) NULL,
    geopoint GEOGRAPHY(POINT) NULL,
    stop_group_id VARCHAR(10) NULL,
    is_disabled BOOLEAN NULL,
    zap VARCHAR(200) NULL,
    created_on TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    modified_by VARCHAR(100) NULL,
    CONSTRAINT stops_master_c1 UNIQUE (space_id, geopoint)
);
CREATE INDEX stops_master_geom1 ON stops_master USING GIST (geopoint);


DROP TABLE IF EXISTS stop_groups;
CREATE TABLE stop_groups(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    stop_group_name VARCHAR(100) NULL,
    description VARCHAR(500) NULL,
    created_on TIMESTAMP(0) NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL
);



DROP TABLE IF EXISTS route_groups;
CREATE TABLE route_groups(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    route_group_name VARCHAR(100) NULL,
    description VARCHAR(500) NULL,
    created_on TIMESTAMP(0) NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL
);


DROP TABLE IF EXISTS config;
CREATE TABLE config(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    config_key VARCHAR(100) NULL,
    config_value VARCHAR(100) NULL,
    created_on TIMESTAMP(0) NULL,
    created_by VARCHAR(100) NULL,
    last_updated TIMESTAMP(0) NULL,
    modified_by VARCHAR(100) NULL
);
CREATE INDEX config_i1 ON config (space_id);


DROP TABLE IF EXISTS tasks;
CREATE TABLE tasks(
    space_id INT NULL,
    id VARCHAR(10) NOT NULL PRIMARY KEY,
    name VARCHAR(10) NULL,
    last_updated TIMESTAMP(0) NULL,
    running BOOLEAN NULL,
    details JSONB default '{}' NOT NULL
);
CREATE INDEX tasks_i1 ON tasks (space_id);
