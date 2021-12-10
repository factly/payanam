// routes.js
var globalRoute = {};
var allStopsLayer = new L.geoJson(null);
var patternLayer = new L.geoJson(null);
var stopsLayer = new L.geoJson(null);
var matchesLayer = new L.geoJson(null);
var otherPatternsLayer = new L.geoJson(null);
var allStops = [];
var allStopsi = {};
var URLParams = {}; // for holding URL parameters
var allStopsLoadedFlag = false;
var routeDrawTrigger = false;
const stopIconSize = [20, 20];

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
$('.leaflet-container').css('cursor','crosshair'); // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
L.control.scale({metric:true, imperial:false}).addTo(map);

// layers
var overlays = {
    "route stops": stopsLayer,
    "pattern": patternLayer,
    "all stops": allStopsLayer,
    "matches": matchesLayer,
    "other patterns": otherPatternsLayer
};
var layerControl = L.control.layers(baseLayers, overlays, {collapsed: true, autoZIndex:false}).addTo(map); 

// https://github.com/Leaflet/Leaflet.fullscreen
map.addControl(new L.Control.Fullscreen({position:'topright'}));

// SVG renderer
var myRenderer = L.canvas({ padding: 0.5 });

// Add in a crosshair for the map. From https://gis.stackexchange.com/a/90230/44746
var crosshairIcon = L.icon({
    iconUrl: crosshairPath,
    iconSize:     [crosshairSize, crosshairSize], // size of the icon
    iconAnchor:   [crosshairSize/2, crosshairSize/2], // point of the icon which will correspond to marker's location
});
crosshair = new L.marker(map.getCenter(), {icon: crosshairIcon, interactive:false});
crosshair.addTo(map);
// Move the crosshair to the center of the map when the user pans
map.on('move', function(e) {
    var currentLocation = map.getCenter();
    crosshair.setLatLng(currentLocation);
    $('.position').html(`${currentLocation.lat.toFixed(3)},${currentLocation.lng.toFixed(3)}`);
});

// lat, long in url
var hash = new L.Hash(map);

// easyButton
L.easyButton('<img src="lib/route.svg" width="100%" title="toggle route lines" data-toggle="tooltip" data-placement="right">', function(btn, map){
    routeLines();
    ;
}).addTo(map);

// ############################################
// RUN ON PAGE LOAD
$(document).ready(function () {
    loadURLParams(URLParams);

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
        // onChange: function(/**Event*/evt) {
        //     console.log(evt.newIndex);
        // }
    });

    // SortableJS commands:
    // to get ordered list of ids, from anywhere https://github.com/SortableJS/Sortable#sortablegetelementhtmlelementsortable
    // Sortable.get(document.getElementById('patterns_order_holder')).toArray()

    // add an item to the list:
    // $('#patterns_order_holder').append('<div class="list-group-item" id="P5">P5</div>');


    loadRoutesList();
    loadStops();
    
    $("#pattern_chosen").change(function () {
        if (! $(this).val()) return;
        loadPattern($(this).val());
    });

    $('#pattern_copy').change(function () {
        if (! $(this).val()) return;
        // check if that pattern has any stops

    });


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

            // load a route from URLParams
            if(URLParams['route']) {
                $('#routes_list').val(URLParams['route']).trigger('change.select2').trigger('change');
            }
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
    


function loadRouteDetails(route_id, pattern_id=null) {
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
            $('#pattern_add').val('');
            let patternsContent = '';
            let sortableContent = '';

            returndata.patterns.forEach(r => {
                let sel = ``;
                if(pattern_id) sel = `selected="selected"`;
                patternsContent += `<option value="${r.id}" ${sel}>${r.name}</option>`;
                sortableContent += `<div class="list-group-item" id="${r.id}">${r.name}</div>`;
            })
            $('#pattern_chosen').html(patternsContent)
            $('#patterns_order_holder').html(sortableContent);
            
            loadPattern($('#pattern_chosen').val());

            $('#route_status').html(`Loaded route id ${route_id}`);

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
    let patternHolder = globalRoute.patterns.filter(r => {return r.id === pid});
    console.log("pattern json:",patternHolder[0]);
    $('.pattern_selected').html(patternHolder[0].name);

    let payload = {
        'pattern_id': pid
    };
    $('#savePattern_status').html(`Loading stops for pattern ${pid}`);
    $.ajax({
        url: `/API/loadPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log("pattern_stops:",returndata.pattern_stops);
            let sortableContent = '';
            returndata.pattern_stops.forEach(r => {
                sortableContent += makeStopDiv(r.stop_id, r.name);
            });
            $('#stops_order_holder').html(sortableContent);
            $('#savePattern_status').html(`Stops loaded.`);

            // map it
            if(allStopsLoadedFlag) {
                routeLines(update=true);
                mapStops();
            }
            else {
                console.log("Stops data not loaded yet so waiting before drawing pattern but setting the routeDrawTrigger trigger");
                routeDrawTrigger = true;
            }
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#pattern_status').html(jqXHR.responseText);
        }
    });

    
    // load pattern_copy with all other patterns
    let otherPatternsHolder = globalRoute.patterns.filter(r => {return r.id != pid});
    // console.log("otherPatternsHolder:",otherPatternsHolder);
    let otherContent = `<option value="">Choose</option>`;
    otherPatternsHolder.forEach(p => {
        // console.log(p.id,p.name);
        otherContent += `<option value="${p.id}">${p.name}</option>`;
    })
    // console.log("otherContent:",otherContent);
    $('#pattern_copy').html(otherContent);

}

function deletePattern() {
    let payload = {
        "patterns": [$('#pattern_chosen').val()]
    };
    $('#pattern_status').html(`Deleting pattern...`);
    $.ajax({
        url: `/API/deletePatterns`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#pattern_status').html(`Pattern deleted.`);
            loadRouteDetails(globalRoute.route.id);

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#pattern_status').html(jqXHR.responseText);
        }
    });
}

function updatePatternsOrder() {
    let payload = {"sequence": Sortable.get(document.getElementById('patterns_order_holder')).toArray() };
    console.log("updatePatternsOrder:", payload.sequence);
    $('#pattern_status').html('Updating patterns order...');
    $.ajax({
        url: `/API/updatePatternsOrder`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#pattern_status').html(`Patterns re-ordered.`);
            loadRouteDetails(globalRoute.route.id);

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#pattern_status').html(jqXHR.responseText);
        }
    });
}


function addPattern() {
    let route_id = globalRoute.route.id;
    let name = $('#pattern_add').val();
    if(name.length <= 1) {
        alert("Enter a proper pattern name first.");
        return;
    }
    // check if name already used
    let nameMatch = globalRoute.patterns.filter(e => {return e.name == name});
    if(nameMatch.length > 0) {
        alert("This pattern name is already used.");
        return;    
    }

    let payload = {
        'route_id': route_id,
        'name': name
    };
    $('#pattern_status').html('Adding pattern...');
    $.ajax({
        url: `/API/addPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#pattern_status').html(`Patterns re-ordered.`);
            let pid = returndata['id'];

            // reload the route, and pass in this id so that it becomes the default selected one.
            loadRouteDetails(route_id, pattern_id=pid);

            // // add the pattern to patterns List and trigger selecting it - avoid having to make another api call
            // // https://select2.org/programmatic-control/add-select-clear-items#create-if-not-exists
            // var newOptionP = new Option(payload['name'], pid, true, true);
            // $('#pattern_chosen').append(newOptionP).trigger('change');
            // loadPattern(pid);
            $('#pattern_status').html(`Created new pattern, id: ${returndata['id']}`);

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#pattern_status').html(jqXHR.responseText);
        }
    });

}


function loadStops() {
    allStopsLoadedFlag = false;
    let payload = {
        "data": ["id", "name", "latitude", "longitude"],
        "indexed": true };
    $('#savePattern_status').html(`Loading stops..`);
    $.ajax({
        url: `/API/loadStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // stopsTable.setData(returndata['stops']);
            // $("#stopsTable_status").html(`Loaded.`);
            allStops = returndata['stops'];
            allStopsi = returndata['indexed'];
            processAllStops();
            $('#savePattern_status').html(`Stops loaded`);
            allStopsLoadedFlag = true;
            if(routeDrawTrigger) {
                console.log("Ok now you can draw the pattern");
                routeLines(update=true);
                mapStops();
                routeDrawTrigger=false;
            }
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#stopsTable_status").html(jqXHR.responseText);
        },
    });
}

function processAllStops() {
    let selectContent = `<option value="">Choose a stop</option>`;

    allStopsLayer.clearLayers();
    var circleMarkerOptions = {
        renderer: myRenderer,
        radius: 3,
        fillColor: 'azure',
        color: 'black',
        weight: 0.5,
        opacity: 0.5,
        fillOpacity: 0.5
    };

    var mapCounter=0;
    allStops.forEach(e => {
        selectContent += `<option value="${e.id}">${e.name.substring(0,50)} (${e.id})</option>`;

        let lat = parseFloat(e.latitude);
        let lon = parseFloat(e.longitude);
        if(!checklatlng(lat,lon)) return;
        let tooltipContent = `${e.name}<br>id: ${e.id}`;
        let popupContent = `${e.name}<br>
            id: ${e.id}<br>
            <button onclick="addStop2Pattern('${e.id}')">Add to pattern</button>`;
        let marker = L.circleMarker([lat,lon], circleMarkerOptions)
            .bindTooltip(tooltipContent, {direction:'top', offset: [0,-5]})
            .bindPopup(popupContent);
        marker.properties = e;
        marker.addTo(allStopsLayer);
        mapCounter ++;
    });
    if (!map.hasLayer(allStopsLayer)) map.addLayer(allStopsLayer);

    $('#stopPicker').html(selectContent);

    $('#stopPicker').select2({
        // data: returndata.results,
        placeholder: "Choose a Stop",
        width: "400px",
        allowClear: true
    });

    $('#stopPicker').change(function () {
        if (! $(this).val()) return;
        let stop_id = $(this).val();
        let stopRow = allStopsi[stop_id];
        let sortableContent = makeStopDiv(stop_id, stopRow.name);
        $('#stops_order_holder').append(sortableContent);

    });

}

function addStop2Pattern(stop_id) {
    console.log("addStop2Pattern",stop_id);
    let stopRow = allStopsi[stop_id];
    let sortableContent = makeStopDiv(stop_id, stopRow.name);
    $('#stops_order_holder').append(sortableContent);
    map.closePopup(); // close popup
    routeLines(update=true);
    mapStops();
}

function savePattern() {
    console.log("savePattern");
}

function savePattern() {

    let payload = {
        "pattern_id": $('#pattern_chosen').val(),
        "stops": Sortable.get(document.getElementById('stops_order_holder')).toArray()
    };
    console.log("savePattern:", payload);
    $('#savePattern_status').html(`Saving...`);
    $.ajax({
        url: `/API/editPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#savePattern_status').html(`Pattern Saved.`);
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $('#savePattern_status').html(jqXHR.responseText);
        },
    });   
}

function removeStop(id) {
    console.log("removeStop:", id);
    $(`.stop_${id}`).remove();
    routeLines(update=true);
    mapStops();

}

function makeStopDiv(id, name) {
    let sortableContent = `<div class="list-group-item stop_${id}" id="${id}">${name}
        &nbsp;&nbsp;&nbsp;<small>${id}</small>
        <button class="x" onclick="removeStop('${id}')">x</button>
        </div>`;
    // close button code from https://stackoverflow.com/a/33336458/4355695
    return sortableContent;
}


// #################################
// route on map

function routeLines(update=false) {
    let stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    if(!stop_ids.length) return;

    if(patternLayer.getLayers().length && map.hasLayer(patternLayer) && !update) {
        // toggle off if already loaded and visible
        map.removeLayer(patternLayer);
        return;
    }
    patternLayer.clearLayers();

    let arr1 = [];
    stop_ids.forEach(s => {
        let srow = allStopsi[s];
        if(! checklatlng(srow.latitude,srow.longitude)) return;
        arr1.push([srow.latitude,srow.longitude]);
    });
    console.log(arr1);

    if(arr1.length < 2) {
        alert("Less than 2 of the stops are mapped, so we cannot show the route on map. Pls add or map stops.");
        return;
    }

    var mapLine = L.polyline.antPath(arr1, {
        color: 'purple', weight:4, delay:1500, interactive:false 
    }).addTo(patternLayer);
    if (!map.hasLayer(patternLayer)) map.addLayer(patternLayer);
}

function mapStops() {
    let stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    if(!stop_ids.length) return;

    stopsLayer.clearLayers();
    let stopCounter = 0;
    for(let i=1;i<=stop_ids.length;i++) {
        let srow = allStopsi[stop_ids[i-1]];
        if(! checklatlng(srow.latitude,srow.longitude)) return;

        let tooltipContent = `${i}: ${srow.name}
        <br><small>${stop_ids[i-1]}</small>`;
        let popupContent = ``;

        var circleMarkerOptions = {
            renderer: myRenderer,
            radius: 5,
            fillColor: 'green',
            color: 'black',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        };

        // let marker = L.circleMarker([srow.latitude,srow.longitude], circleMarkerOptions)
        let marker = L.marker([lat,lon], { 
            icon: L.divIcon({
                className: `stop-divicon`,
                iconSize: stopIconSize,
                html: ( parseInt(i)+1 )
            }) 
        })
        .bindTooltip(tooltipContent, {direction:'top', offset: [0,-5]})
        .bindPopup(popupContent);
        marker.properties = srow;
        marker.properties['id'] = stop_ids[i-1];
        marker.addTo(stopsLayer);
    }
    if (!map.hasLayer(stopsLayer)) map.addLayer(stopsLayer);
}