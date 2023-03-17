// admin.js



// ###########################################################
// RUN ON PAGE LOAD
$(document).ready(function() {
    // load configs, then after that run loadConfigSettings() function here
    loadConfig(callbackFlag=true, callbackFunc=loadConfigSettings, depotFlag=true);
    
    fetchGTFSexports();
});


// ###########################################################
// FUNCTIONS

function loadConfigSettings() {
    console.log("loadConfigSettings");
    // globalConfig
    if(globalConfig['fuzzyFlag']) {
        $('#fuzzyFlag').val(globalConfig['fuzzyFlag']);
    }

    if(globalConfig['fuzzyDistance']) {
        $('#fuzzyDistance').val(globalConfig['fuzzyDistance']);
    }

    // gtfs agency
    if(globalConfig['agency_id']) {
        $('#agency_id').val(globalConfig['agency_id']);
    }
    if(globalConfig['agency_name']) {
        $('#agency_name').val(globalConfig['agency_name']);
    }
    if(globalConfig['agency_url']) {
        $('#agency_url').val(globalConfig['agency_url']);
    }
    if(globalConfig['agency_timezone']) {
        $('#agency_timezone').val(globalConfig['agency_timezone']);
    }
    if(globalConfig['agency_phone']) {
        $('#agency_phone').val(globalConfig['agency_phone']);
    }

    // calendar
    if(globalConfig['calendar_default_service_id']) {
        $('#calendar_default_service_id').val(globalConfig['calendar_default_service_id']);
    }
    if(globalConfig['calendar_default_start_date']) {
        $('#calendar_default_start_date').val(globalConfig['calendar_default_start_date']);
    }
    if(globalConfig['calendar_default_end_date']) {
        $('#calendar_default_end_date').val(globalConfig['calendar_default_end_date']);
    }
    if(globalConfig['calendar_default_days']) {
        $('#calendar_default_days').val(globalConfig['calendar_default_days']);
    }

    // depots list
    let content = `<option value="">All depots</option>`
    globalDepotsList.forEach(d => {
        content += `<option value="${d}">${d}</option>`;
    });
    $('#gtfs_export_depot_select').html(content);

    $('#gtfs_export_depot_select').selectize({
        placeholder: "All depots",
        plugins: ['remove_button'] // spotted here: https://stackoverflow.com/q/51611957/4355695
    });

    // GTFS defaults
    if(globalConfig['gtfs_default_loc']) {
        $('#gtfs_default_loc').val(globalConfig['gtfs_default_loc']);
    }
    if(globalConfig['gtfs_route_type']) {
        $('#gtfs_route_type').val(globalConfig['gtfs_route_type']);
    }
    if(globalConfig['gtfs_default_tripPerPattern']) {
        $('#gtfs_default_tripPerPattern').val(globalConfig['gtfs_default_tripPerPattern']);
    }
    if(globalConfig['gtfs_default_tripstart']) {
        $('#gtfs_default_tripstart').val(globalConfig['gtfs_default_tripstart']);
    }
    if(globalConfig['gtfs_default_calcTimings']) {
        $('#gtfs_default_calcTimings').val(globalConfig['gtfs_default_calcTimings']);
    }
    if(globalConfig['gtfs_default_speed']) {
        $('#gtfs_default_speed').val(globalConfig['gtfs_default_speed']);
    }

    



    // selectize
    $('#gtfs_route_type').selectize({
        placeholder: "Choose route type"
    });
}

function saveFuzzySettings() {
    console.log("saveFuzzySettings");
    var payload = { "data":[]};

    payload.data.push({ "key": "fuzzyFlag", "value": $('#fuzzyFlag').val() });

    payload.data.push({ "key": "fuzzyDistance", "value": parseFloat($('#fuzzyDistance').val())});
    
    $('#saveFuzzySettings_status').html("Saving..");
    console.log(payload);
    $.ajax({
        url: `${APIpath}saveConfig`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            $('#saveFuzzySettings_status').html("Changes Saved.");
            
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#saveFuzzySettings_status').html(jqXHR.responseText);
        }
    });
}


function gtfs_settings_update() {
    console.log("gtfs_settings_update");
    var payload = { "data":[]};
    payload.data.push({ "key": "agency_id", "value": $('#agency_id').val() });
    payload.data.push({ "key": "agency_name", "value": $('#agency_name').val() });
    payload.data.push({ "key": "agency_url", "value": $('#agency_url').val() });
    payload.data.push({ "key": "agency_timezone", "value": $('#agency_timezone').val() });
    payload.data.push({ "key": "agency_phone", "value": $('#agency_phone').val() });
    payload.data.push({ "key": "calendar_default_service_id", "value": $('#calendar_default_service_id').val() });
    payload.data.push({ "key": "calendar_default_start_date", "value": $('#calendar_default_start_date').val() });
    payload.data.push({ "key": "calendar_default_end_date", "value": $('#calendar_default_end_date').val() });
    payload.data.push({ "key": "calendar_default_days", "value": $('#calendar_default_days').val() });
    payload.data.push({ "key": "gtfs_route_type", "value": $('#gtfs_route_type').val() });
    payload.data.push({ "key": "gtfs_default_loc", "value": $('#gtfs_default_loc').val() });
    payload.data.push({ "key": "gtfs_default_tripPerPattern", "value": $('#gtfs_default_tripPerPattern').val() });
    payload.data.push({ "key": "gtfs_default_tripstart", "value": $('#gtfs_default_tripstart').val() });
    payload.data.push({ "key": "gtfs_default_calcTimings", "value": $('#gtfs_default_calcTimings').val() });
    payload.data.push({ "key": "gtfs_default_speed", "value": $('#gtfs_default_speed').val() });

    $('#gtfs_settings_update_status').html(`Saving GTFS settings..`);

    $.ajax({
        url: `${APIpath}saveConfig`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            $('#gtfs_settings_update_status').html("GTFS settings saved.");
            
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#gtfs_settings_update_status').html(jqXHR.responseText);
        }
    });
}

function createGTFS() {
    let depotsList = $('#gtfs_export_depot_select').val();
    let payload = {'depotsList':depotsList};

    $('#createGTFS_status').html("Starting GTFS...");
    $.ajax({
        url: `${APIpath}createGTFS`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            let content = ``;
            if (returndata.started) {
                content =`Started GTFS export, token: ${returndata.token}.`;
                setTimeout(function () {
                    fetchGTFSexports();
                }, 4000);
            }
            else content = `Not starting as there is an ongoing export since ${(returndata.age/60).toFixed(1)} mins.`

            $('#createGTFS_status').html(content);

            

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#createGTFS_status').html(jqXHR.responseText);
        }
    });

}

function fetchGTFSexports() {
    $('#exportsList').html(`Loading..`);
    $.ajax({
        url: `${APIpath}createGTFS_status`,
        type: "GET",
        //data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            let content = ``;
            returndata.tasks.forEach(t => {
                // <div class="card-body">
                content += `<div class="alert alert-secondary">
                `;

                if(t.completed) {
                    if (t.no_patterns) {
                        content += `<span class="badge badge-secondary">${t.token}</span> <small>Started: ${t.started_at}</small><br>
                        No patterns with stops found, so no data to make GTFS of.<br>`;
                    }
                    else if (t.no_timings) {
                        content += `<span class="badge badge-secondary">${t.token}</span> <small>Started: ${t.started_at}</small><br>
                        No timings for any route, and default trip creation is disabled (see settings), so no data to make GTFS of.<br>`;

                    }
                    else content += `<big><a class="badge badge-success" href="gtfs/gtfs_${t.token}/gtfs_${t.token}.zip">
                        <span class="oi oi-data-transfer-download"></span>
                        ${t.token}</a></big> <small>Completed: ${t.last_updated}</small><br>`;
                    }
                else {
                    content += `<span class="badge badge-warning">${t.token}</span> <small>Started: ${t.started_at}</small><br>`;
                }
                
                if(t.depots.length) content += `Depots: ${t.depots.join(', ')}<br>`;
                
                let arr1 = [];
                if (t.num_routes) arr1.push(`Routes: ${t.num_routes}`);
                if (t.num_stops) arr1.push(`Stops: ${t.num_stops}`);
                if (t.num_trips) arr1.push(`Trips: ${t.num_trips}`);
                if (t.num_stop_times) arr1.push(`Timings: ${t.num_stop_times}`);
                if(arr1.length)
                    content += arr1.join(' | ') + '<br>';

                // if assumed stuff
                let arr2 = [];
                if (t.createdTrips) arr2.push(`Default trips created: ${t.createdTrips}`);
                if (t.excludedTrips) arr2.push(`Trips excluded: ${t.excludedTrips}`);
                if (t.unmapped_stops) arr2.push(`Unmapped stops: ${t.unmapped_stops}`);
                if (t.calculatedTimings) arr2.push(`Calculated timings: ${t.calculatedTimings}`);
                if ((! t.completed) && t.trips_processed) arr2.push(`Processed trips: ${t.trips_processed}`);
                if(arr2.length)
                    content += arr2.join(' | ') + '<br>';

                content += `</div>`
            });
            $('#exportsList').html(content);
            
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#exportsList').html(jqXHR.responseText);
        }
    });
}