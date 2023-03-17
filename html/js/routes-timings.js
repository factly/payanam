// routes-timings.js

const tripBatch = 10
var globalTimingsChanged = false;
var globalTripsPages = 0;

// ############################################
// TABULATOR




// ############################################
// RUN ON PAGE LOAD
$(document).ready(function () {
	flatpickr("#newTripStartTime", { 
		allowInput: true,
		enableTime: true,
		noCalendar: true,
		time_24hr: true,
		defaultHour: 6,
		defaultMinute: 0
	});

});


// ############################################
// FUNCTIONS

function clearTimings(pid=null) {
    // clear out existing tabulator object if we're reloading.
    if(Tabulator.findTable("#tabulator_stoptimes").length) {
        Tabulator.findTable("#tabulator_stoptimes")[0].destroy();
    }
    if(pid) $('#tabulator_stoptimes').html(`Loading timings for pattern ${pid}..`);
    else $('#tabulator_stoptimes').html(`<button onclick="loadTimings()" class="btn btn-sm btn-secondary">Click to load timings</button>`);
}

function loadTimings(pageNum=1) {
    if(patternChanged) {
        alert(`Please save changes to the pattern first.`);
        return;
    }
    let pid = $('#pattern_chosen').val();
    if(! pid ||  ! pid.length) {
        $('#saveTimings_status').html(`Load a pattern first.`);
        return;
    }
	let payload = {
        "pattern_id": pid,
        "page": pageNum
    };
    $('#saveTimings_status').html(`Loading timings for pattern ${pid}..`);

    clearTimings(pid);
    
    $.ajax({
        url: `${APIpath}loadTimings`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // console.log("loadTimings:",returndata);
            
            let columnsConfig = [
                {title:'num', field:'stop_sequence', headerFilter:'input', width:30, frozen:true},
                {title:'stop', field:'name', headerFilter:'input', width:200, headerSort:false, frozen:true},
                {title:'id', field:'stop_id', headerFilter:'input', width:100, visible:false}
            ];

            let delContent = '<option value="">Select trip</option>';
            returndata.trips.forEach(t => {
                let hhmm = t.start_time.slice(0, 5); // from https://bobbyhadz.com/blog/javascript-get-first-n-characters-of-string
                let tripCol = {
                    title: hhmm,
                    field: t.id,
                    headerFilter:'input', width:70,
                    headerSort:false, 
                    editor:true, editorParams:{mask:"99:99"},
                    headerTooltip: `trip_id: ${t.id}`
                };
                // console.log("tripCol:",tripCol);
                columnsConfig.push(tripCol);

                delContent += `<option value="${t.id}">${hhmm} (${t.id})</option>`;
            });
            $('#trip2Delete').html(delContent);


            var tabulator_stoptimes = new Tabulator("#tabulator_stoptimes", {
                height: 350,
                selectable: 1,
                index: "stop_id",
                columns: columnsConfig,
                data: returndata.stop_times
            });
            tabulator_stoptimes.on("cellEdited", function(cell){
                globalTimingsChanged=true;
            });

            // Pagination of trips: showing 10 trips only at a time
            if(pageNum == 1) {
                globalTripsPages = Math.ceil(returndata.num_trips/tripBatch);
            }
            let prev = ``;
            if(pageNum > 1) prev = `<button onclick="loadTimings(${pageNum-1})">prev</button>&nbsp;&nbsp;`;
            let next = ``;
            if(pageNum < globalTripsPages) next = `&nbsp;&nbsp;<button onclick="loadTimings(${pageNum+1})">next</button>`;
            $('#timingsPaginationHolder').html(`Page: ${prev}${pageNum}${next} of ${globalTripsPages}`);

            $('#saveTimings_status').html(`Timings loaded for pattern ${pid}`);
    	},
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#saveTimings_status').html("error:" + jqXHR.responseText);
            $('#tabulator_stoptimes').html("error:" + jqXHR.responseText);
        }
    });
}

function addTrip() {
    if(globalTimingsChanged) {
        if(!confirm(`There are unsaved changes in the table above, this action will erase them. Are you sure you want to continue? Else, click Cancel, Save the timings first then come back.`)) {
            return;
        }
    }
    let newTripStartTime = $('#newTripStartTime').val() || '06:00';
    let pid = $('#pattern_chosen').val();
    let payload = {
        "pattern_id": pid,
        start_time: newTripStartTime
    };
    $('#addTrip_status').html('Adding..');
    $.ajax({
        url: `${APIpath}addTrip`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#addTrip_status').html(`Added trip, id: ${returndata.trip_id}`);
            $('#tabulator_stoptimes').html(`Reloading timings..`);
            loadTimings(); // just reload the damn thing.
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#addTrip_status').html("error:" + jqXHR.responseText);
        }
    });
}

function deleteTrip() {
    let trip_id = $('#trip2Delete').val();
    if(!trip_id) return;
    if(!confirm(`Are you sure you want to delete this trip?`)) return;

    let pid = $('#pattern_chosen').val();
    let payload = {
        "trip_id": trip_id,
        "pattern_id": pid
    };
    $('#deleteTrip_status').html(`Deleting trip..`);
    $.ajax({
        url: `${APIpath}deleteTrip`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#deleteTrip_status').html(`Deleted trip ${trip_id}`);
            $('#tabulator_stoptimes').html(`Reloading timings..`);
            loadTimings(); // just reload the damn thing.
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#deleteTrip_status').html("error:" + jqXHR.responseText);
        }
    });

}

function saveTimings() {

    $('#saveTimings_status').html(`Saving to DB..`);
    let table = Tabulator.findTable("#tabulator_stoptimes")[0];

    let edits = [];
    table.getEditedCells().forEach(cell => {
        let stop_sequence = cell.getRow().getData().stop_sequence;
        let trip_id = cell.getColumn().getField();
        let arrival_time = cell.getValue();
        console.log(trip_id,stop_sequence,arrival_time);
        edits.push({'trip_id':trip_id, 'stop_sequence':stop_sequence,'arrival_time':arrival_time});
    })

    if(edits.length == 0) {
        alert(`No timings changes done yet, nothing to save.`);
        return;
    }
    let pattern_id = $('#pattern_chosen').val();
    // let data = table.getData();
    console.log("saveTimings:",edits);
    let payload = {
        "pattern_id": pattern_id,
        "edits": edits
    };
    $.ajax({
        url: `${APIpath}saveTimings`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#saveTimings_status').html(`${returndata.timings_updated} timing changes saved`);
            globalTimingsChanged = false;
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#saveTimings_status').html("error:" + jqXHR.responseText);
        }
    });
}

function resetTimings() {
    if(globalTimingsChanged) {
        if(confirm(`Are you sure you want to lose all timings changes done and reset the table?`)) {
            loadTimings();
            return;
        }
    }
    loadTimings();
}

// TO DO: Download full route's timings as excel, and let user edit offline and upload it again

