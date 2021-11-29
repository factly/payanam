// routes.js

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

function loadRoutesList() {
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
            $('#routes_list').val(null).trigger('change');

            $('#routes_list').on('select2:select', function (e) {
                let route_id = e.params.data.id;
                console.log(`routes_list select2:select event, ${route_id} chosen`);
            });
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
        }
    });
}

function createRoute() {
    let payload = { 'name': $('#new_route_name').val() };
    if(! payload.name.length) return;

    $.ajax({
        url: `/API/addRoute`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#createRoute_status').html(`created, id: ${returndata['id']}`);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#createRoute_status').html(`jqXHR.responseText`);
        }
    });
}