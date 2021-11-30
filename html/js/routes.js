// routes.js
var globalRoute = {};

// ############################################




// #################################
/* MAP */

var cartoPositron = L.tileLayer.provider('CartoDB.Positron');
var OSM = L.tileLayer.provider('OpenStreetMap.Mapnik');
var gStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
var gHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
var esriWorld = L.tileLayer.provider('Esri.WorldImagery');
var baseLayers = { 
    "OpenStreetMap.org" : OSM, 
    "Carto Positron": cartoPositron, 
    "ESRI Satellite": esriWorld,
    "gStreets": gStreets, 
    "gHybrid": gHybrid
};

var map = new L.Map('map', {
    center: STARTLOCATION,
    zoom: STARTZOOM,
    layers: [cartoPositron],
    scrollWheelZoom: true,
    maxZoom: 20,
});

// ############################################
// RUN ON PAGE LOAD
$(document).ready(function () {
    // SORTABLE from https://sortablejs.github.io/Sortable/#simple-list
    new Sortable(document.getElementById('patterns_order_holder'), {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dataIdAttr: 'id'
    });
    
    new Sortable(document.getElementById('stops_order_holder'), {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dataIdAttr: 'id',
        onChange: function(/**Event*/evt) {
            console.log(evt.newIndex);
        }
    });

    // SortableJS commands:
    // to get ordered list of ids, from anywhere https://github.com/SortableJS/Sortable#sortablegetelementhtmlelementsortable
    // Sortable.get(document.getElementById('patterns_order_holder')).toArray()

    // add an item to the list:
    // $('#patterns_order_holder').append('<div class="list-group-item" id="P5">P5</div>');


    loadRoutesList();

});


// ############################################
// FUNCTIONS

$('a#pattern_reverse').click(function(e){
    e.preventDefault();
    console.log('reversing!');
    // do reversing
});

function loadRoutesList(route_id) {
    $('#route_status').html(`Loading routes...`);
    let payload = {};
    $.ajax({
        url: `/API/loadRoutesList`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {

            $('#routes_list').select2({
                data: returndata.results,
                placeholder: "Choose a Route",
                width: "300px",
                allowClear: true
            });

            $('#routes_list').val(null).trigger('change.select2'); // select-none, from https://select2.org/programmatic-control/add-select-clear-items#clearing-selections

            $('#routes_list').on('change', function (e) {
                let route_id = $('#routes_list').val();
                console.log(`routes_list select2:select event, ${route_id} chosen`);
                if(!route_id) return;

                loadRouteDetails(route_id);
                $('#routeActionButton').html(`Update route info`);
            });

            $('#routes_list').on('select2:clear', function (e) {
                clearRoute();
            });

            $('#route_status').html(`All routes loaded.`);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#route_status').html(jqXHR.responseText);
        }
    });
}

function routeAction() {
    // add or update route info
    let payload = { 
        'name': $('#route_name').val(),
        'description': $('#route_description').val(),
        'depot': $('#route_depot').val(),
    };
    if(! payload.name.length) {
        alert("Please enter a route name");
        return;
    }
    
    // decide if its a new route or update existing route
    let route_id = $('#routes_list').val();
    if (route_id) {
        payload['route_id'] = route_id;
        console.log("updating route")
        $('#route_status').html(`Updating route info...`);
    } else {
        $('#route_status').html(`Creating new route...`);
    }

    $.ajax({
        url: `/API/addRoute`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            // loadRoutesList(returndata['id']);

            if(!route_id) {
                // add the route to routesList and trigger selecting it - avoid having to make another api call
                // https://select2.org/programmatic-control/add-select-clear-items#create-if-not-exists
                var newOption = new Option(payload['name'], returndata.id, true, true);
                $('#routes_list').append(newOption).trigger('change');

                $('#route_status').html(`Created new route, id: ${returndata['id']}`);
            } else {
                $('#route_status').html(`Updated route info.`);
            }

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#route_status').html(jqXHR.responseText);
        }
    });

}
    


function loadRouteDetails(route_id) {
    $('#route_status').html(`Loading route id ${route_id}...`);
    let payload = { route_id: route_id };
    $.ajax({
        url: `/API/loadRouteDetails`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            globalRoute = returndata;
            $('#route_name').val(returndata.route.name);
            $('#route_description').val(returndata.route.description);
            $('#route_depot').val(returndata.route.depot);

            // to do: load patterns
            let patternsContent = '';
            let sortableContent = '';

            returndata.patterns.forEach(r => {
                patternsContent += `<option value="${r.id}">${r.name}</option>`;
                sortableContent += `<div class="list-group-item" id="${r.id}">${r.name}</div>`;
            })
            $('#pattern_chosen').html(patternsContent)
            $('#patterns_order_holder').html(sortableContent);
            
            loadPattern($('#pattern_chosen').val());

            $('#route_status').html(`Loaded route`);

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#route_status').html(jqXHR.responseText);
        }
    });
}

function clearRoute(){
    $('#route_name').val('');
    $('#route_description').val('');
    $('#route_depot').val('');

    // to do: clear patterns

    $('#routeActionButton').html(`Create Route`);
}

function loadPattern(pid) {
    console.log(`loadPattern: ${pid}`);
    let pattern = globalRoute.patterns.filter(r => {return r.id === pid});
    let pattern_stops = globalRoute.pattern_stops[pid];

}