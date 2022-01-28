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


DROP TABLE IF EXISTS pattern_stops;
CREATE TABLE pattern_stops(
	space_id INT NULL,
	id VARCHAR(10) NOT NULL PRIMARY KEY,
	pattern_id VARCHAR(10) NULL,
	stop_id VARCHAR(10) NULL,
	stop_sequence SMALLINT NULL,
	time_offset INT NULL
);



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


DROP TABLE IF EXISTS stop_times;
CREATE TABLE stop_times(
	space_id INT NULL,
	id VARCHAR(10) NOT NULL PRIMARY KEY,
	trip_id VARCHAR(100) NULL,
	stop_sequence SMALLINT NULL,
	arrival_time TIME(0) NULL,
	departure_time TIME(0) NULL,
	timepoint BOOLEAN NULL
);


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
	latitude DECIMAL(11,8) NULL,
	longitude DECIMAL(11,8) NULL,
	geopoint GEOGRAPHY(POINT) NULL,
	stop_group_id VARCHAR(10) NULL,
	is_disabled BOOLEAN NULL,
	zap VARCHAR(200) NULL,
	created_on TIMESTAMP(0) NULL,
	created_by VARCHAR(100) NULL,
	last_updated TIMESTAMP(0) NULL,
	modified_by VARCHAR(100) NULL,
	CONSTRAINT stops_master_c1 UNIQUE (latitude, longitude)
);


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

