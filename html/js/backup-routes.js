// routes.js

// ############################################
// GLOBAL VARIABLES

var globalRoutesList = [];
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
var globalClickLat, globalClickLon;
var globalUnMappedStops = [];
var globalSelectedStop = {};
var globalStopNum = 0;
var patternChanged = false;
var globalNotMapped = 0;

// ACE editor
var stopsEntry = ace.edit("stopsEntry");
// var global_stopsEntry_changed = false;


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
    contextmenu: true,
    contextmenuWidth: 140,
    contextmenuItems: [
        { text: 'Add a new Stop here', callback: route_newStop_popup },
        { text: 'Map an unmapped Stop here', callback: route_unMappedStop_popup }
    ]
});
$('.leaflet-container').css('cursor','crosshair'); // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
L.control.scale({metric:true, imperial:false, position: "bottomright"}).addTo(map);

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

// custom content on top of the map
// easyButton
L.easyButton('<img src="lib/route.svg" width="100%" title="toggle route lines" data-toggle="tooltip" data-placement="right">', function(btn, map){
    routeLines();
    ;
}).addTo(map);

L.control.custom({
    position: 'bottomleft',
    content: `<div id="panel">
    Stop: <span id="stopInfo">select one</span> <span id="unmappedHolder"></span><br>
    <a href="javascript:{}" onclick="loadSuggestions()">Load suggestions</a> within visible area.<br>
    <div id="suggestions"></div>
    </div>`,
    classes: `divOnMap1`
}).addTo(map);

// globally used marker styles
var allStopsMarkerOptions = {
    renderer: myRenderer,
    radius: 3,
    fillColor: 'azure',
    color: 'black',
    weight: 0.5,
    opacity: 0.5,
    fillOpacity: 0.5
};


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
        dataIdAttr: 'data-id',
        onChange: function(/**Event*/evt) {
            patternChanged = true;
            reNumber();
            routeLines(update=true);
            mapStops();
        }
    });

    // SortableJS commands:
    // to get ordered list of ids, from anywhere https://github.com/SortableJS/Sortable#sortablegetelementhtmlelementsortable
    // Sortable.get(document.getElementById('patterns_order_holder')).toArray()

    // add an item to the list:
    // $('#patterns_order_holder').append('<div class="list-group-item" id="P5">P5</div>');


    loadRoutesList();
    loadStops();
    loadConfig();
    
    $("#pattern_chosen").change(function () {
        if (! $(this).val()) return;
        loadPattern($(this).val());
    });

    $('#pattern_copy').change(function () {
        if (! $(this).val()) return;
        copyFromPattern($(this).val());
    });

    // //ACE editor : listen for changes
    // stopsEntry.session.on('change', function(delta) {
    //     global_stopsEntry_changed = true;
    // });

});


// ############################################
// ROUTES

function loadRoutesList(route_id) {
    $('#route_status').html(`Loading routes...`);
    let payload = {};
    $.ajax({
        url: `${APIpath}loadRoutesList`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {

            // populate depot selector
            let depotContent = `<option value="">Depot</option>`;
            returndata.depots.forEach(d => {
                depotContent += `<option value="${d}">${d}</option>`;
            });
            $('#depot_select').html(depotContent);

            globalRoutesList = returndata.routes;
            
            $('#routes_list').select2({
                data: returndata.routes,
                placeholder: "Choose a Route",
                width: "300px",
                allowClear: true
            });

            $('#routes_list').val(null).trigger('change.select2'); // select-none, from https://select2.org/programmatic-control/add-select-clear-items#clearing-selections

            $('#routes_list').on('change', function (e) {
                let route_id = $('#routes_list').val();
                // console.log(`routes_list select2:select event, ${route_id} chosen`);
                if(!route_id) return;

                loadRouteDetails(route_id);
                $('#routeActionButton').html(`Update route info`);
            });

            $('#routes_list').on('select2:clear', function (e) {
                clearTimings();
                clearUI();
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
        url: `${APIpath}addRoute`,
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
        url: `${APIpath}loadRouteDetails`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // console.log(returndata);
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

// ####################################
// PATTERNS

function loadPattern(pid) {
    console.log(`loadPattern: ${pid}`);
    clearTimings();
    clearUI();
    let patternHolder = globalRoute.patterns.filter(r => {return r.id === pid});
    // console.log("pattern json:",patternHolder[0]);
    $('.pattern_selected').html(`${patternHolder[0].name} <small><small>(${pid})</small></small>`);

    patternLayer.clearLayers();
    stopsLayer.clearLayers();
    $('#stops_order_holder').html(`Loading..`);
    $('#savePattern_status').html(`Loading stops for pattern ${pid}`);
    let payload = {
        'pattern_id': pid
    };
    $.ajax({
        url: `${APIpath}loadPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // console.log("pattern_stops:",returndata.pattern_stops);
            clearUI();
            let sortableContent = '';
            globalNotMapped = 0;
            returndata.pattern_stops.forEach((r,N) => {
                sortableContent += makeStopDiv(r.stop_id, r.name);
                if(!r.latitude) globalNotMapped ++;
            });
            $('#stops_order_holder').html(sortableContent);
            reNumber();
            $('#savePattern_status').html(`Pattern loaded. ${returndata.pattern_stops.length} stops total, ${globalNotMapped} not mapped yet.`);

            // map it
            if(allStopsLoadedFlag) {
                routeLines(update=true);
                mapStops();
            }
            else {
                console.log("Stops data not loaded yet so waiting before drawing pattern but setting the routeDrawTrigger trigger");
                routeDrawTrigger = true;
            }
            patternChanged = false;
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#savePattern_status').html(jqXHR.responseText);
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
    let count = $('#stops_order_holder').children().length;
    if(!confirm(`Are you sure you want to delete this pattern? It has ${count} stops mapped right now.`)) {
        return;
    }
    let payload = {
        "patterns": [$('#pattern_chosen').val()]
    };
    $('#pattern_status').html(`Deleting pattern...`);
    $.ajax({
        url: `${APIpath}deletePatterns`,
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
        url: `${APIpath}updatePatternsOrder`,
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
        url: `${APIpath}addPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            let pid = returndata['id'];
            
            // reload the route, and pass in this id so that it becomes the default selected one.
            loadRouteDetails(route_id, pattern_id=pid);
            $('#pattern_status').html(`Created new pattern, id: ${returndata['id']}`);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#pattern_status').html(jqXHR.responseText);
        }
    });

}

function savePattern() {
    let payload = {
        "pattern_id": $('#pattern_chosen').val(),
        "stops": Sortable.get(document.getElementById('stops_order_holder')).toArray()
    };
    // console.log("savePattern:", payload);
    $('#savePattern_status').html(`Saving...`);
    $.ajax({
        url: `${APIpath}editPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#savePattern_status').html(`Pattern Saved.`);
            patternChanged = false;
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $('#savePattern_status').html(jqXHR.responseText);
        },
    });   
}

function resetPattern() {
    clearUI();
    patternChanged = false;
    let pid = $('#pattern_chosen').val();
    loadPattern(pid);
}

function clearUI() {
    $('#stopInfo').html(`select one`);
    $('#unmappedHolder').html(``);
    $('#suggestions').html(``);
    matchesLayer.clearLayers();
    $('#autoMapPattern_status').html(``);
}

// ####################################
// STOPS

function loadStops() {
    allStopsLoadedFlag = false;
    let payload = {
        "data": ["id", "name", "latitude", "longitude"],
        "indexed": true };
    $('#belowMap').html(`Loading stops..`);
    $.ajax({
        url: `${APIpath}loadStops`,
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
            $('#belowMap').html(`All stops loaded`);
            allStopsLoadedFlag = true;

            // in case this api response came late and a pattern had to auto-load, we've set a trigger flag.
            if(routeDrawTrigger) {
                console.log("Ok now you can draw the pattern");
                routeLines(update=true);
                mapStops();
                routeDrawTrigger=false;
            }
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#belowMap").html(jqXHR.responseText);
        },
    });
}

function processAllStops() {
    let selectContent = `<option value="">Choose a stop</option>`;

    allStopsLayer.clearLayers();
    
    // var mapCounter=0;
    allStops.forEach(e => {
        let unmappedInd = '';

        let lat = parseFloat(e.latitude);
        let lon = parseFloat(e.longitude);
        if(checklatlng(lat,lon)) {
            let tooltipContent = `${e.name}<br>id: ${e.id}`;
            let popupContent = `${e.name}<br>
                id: ${e.id}<br>
                <b><a href="javascript:{}" onclick="insertStopInPattern('${e.id}')">Add to pattern</a></b> at <input class="narrow" id="stopPosition">`;
            let marker = L.circleMarker([lat,lon], allStopsMarkerOptions)
                .bindTooltip(tooltipContent, {direction:'top', offset: [0,-5]})
                .bindPopup(popupContent);
            marker.properties = e;
            marker.addTo(allStopsLayer);
            // mapCounter ++;
        } else {
            unmappedInd = ' (unmapped)';
        }

        selectContent += `<option value="${e.id}">${e.name.substring(0,50)} (${e.id})${unmappedInd}</option>`;

    });
    if (!map.hasLayer(allStopsLayer)) map.addLayer(allStopsLayer);

    $('#stopPicker').html(selectContent);

    $('#stopPicker').select2({
        // data: returndata.results,
        placeholder: "Add a Stop",
        width: "100%",
        allowClear: true
    });

    $('#stopPicker').change(function () {
        if (! $(this).val()) return;
        addStop2Pattern($(this).val());
        
        // let stop_id = $(this).val();
        // let stopRow = allStopsi[stop_id];
        // let sortableContent = makeStopDiv(stop_id, stopRow.name);
        // $('#stops_order_holder').append(sortableContent);
        // reNumber();
        // routeLines(update=true);
        // mapStops();
    });

}

function addStop2Pattern(stop_id, redraw=true) {
    console.log("addStop2Pattern",stop_id);
    let stopRow = allStopsi[stop_id];
    let sortableContent = makeStopDiv(stop_id, stopRow.name);
    $('#stops_order_holder').append(sortableContent);
    if(!redraw) return;
    reNumber();
    routeLines(update=true);
    mapStops();
    map.closePopup(); // close popup
    patternChanged = true;
}

function insertStopInPattern(stop_id) {
    let stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    let pos = parseInt($('#stopPosition').val());
    console.log("insertStopInPattern",stop_id, pos);
    if((!pos && pos!=0)|| pos=='' || pos>stop_ids.length || pos < 0 ) {
        addStop2Pattern(stop_id);
        return;
    }
    
    stop_ids.splice(pos-1, 0, stop_id);
    // console.log(stop_ids);
    let sortableContent = '';
    stop_ids.forEach((id,N) => {
        sortableContent += makeStopDiv(id, allStopsi[id].name);
    });
    $('#stops_order_holder').html(sortableContent);
    reNumber();
    routeLines(update=true);
    mapStops();

    $('#stopPosition').val('');
    map.closePopup(); // close popup
    patternChanged = true;
}

function removeStop(id) {
    console.log("removeStop:", id);
    $(`.stop_${id}`).remove();
    reNumber();
    routeLines(update=true);
    mapStops();
    patternChanged = true;

}

function makeStopDiv(id, name) {
    // if(!sr) sr = $('#stops_order_holder').children().length + 1;
    let printname = name;
    if(name.length > 40) printname = name.substring(0,40) + '..';

    let sortableContent = `<div class="list-group-item stop_${id}" data-id="${id}" title="${name}">
    <div onclick="clickPatternStop('${id}')"><span class="stopNum ${id}"></span>. ${printname} 
    <small>${id}<span class="unmapped ${id}"></span></small></div>
        
       
        <div class="removeStopButton" onclick="removeStop('${id}')">x</div>
        </div>`;
    // close button code from https://stackoverflow.com/a/33336458/4355695
    return sortableContent;

    /* <div class="timeOffsetHolder"><small>
            <input class="narrow" class="timeOffset ${id}">min
        </small></div>
    */
}

function reNumber() {
    let stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    stop_ids.forEach((id, N) => {
        $(`.stopNum.${id}`).html(String(N+1));
    });
}

$('a#pattern_reverse').click(function(e){
    e.preventDefault();
    console.log('reversing!');
    // do reversing
    let sortable = Sortable.get(document.getElementById('stops_order_holder'));
    let order = sortable.toArray();
    sortable.sort(order.reverse(), true);
    reNumber();
    routeLines(update=true);
    mapStops();
    patternChanged = true;
});

function copyFromPattern(pid) {

    let payload = {
        'pattern_id': pid
    };
    $.ajax({
        url: `${APIpath}loadPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // console.log("pattern_stops:",returndata.pattern_stops);
            if(!returndata.pattern_stops.length) {
                console.log("No stops in that pattern.");
                $('#savePattern_status').html(`No stops in the other pattern.`);
                return;
            }
            if (!confirm(`Are you sure you want to bring in ${returndata.pattern_stops.length} stops from another pattern?`)) return;
            
            let sortableContent = '';
            returndata.pattern_stops.forEach((r,N) => {
                let sortableContent = makeStopDiv(r.stop_id, r.name);
                $('#stops_order_holder').append(sortableContent);
            });
            $('#savePattern_status').html(`Stops from ${pid} added.`);

            reNumber();
            routeLines(update=true);
            mapStops();
            patternChanged = true;

        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#savePattern_status').html(jqXHR.responseText);
        }
    });
}


function addStopsByNameOpenModal() {
    // do other checks as needed
    stopsEntry.setValue(``);
    $('#nameStops_status').html(``);
    $('#modal_nameStops').modal('show');
    
}

function addStopsByName() {
    console.log("addStopsByName");
    let names = [], badnames=[];
    let content = stopsEntry.getValue().split('\n');
    content.forEach(x => {
        x = x.trim();
        if(x.length) {
            if(x.length >= 3) {
                names.push({"name": x});
            } else {
                badnames.push(x);
            }
        }
    });

    console.log(names);
    let status = ``;
    if(badnames.length) {
        status += `Note: Dropping these bad names: ${badnames.join(', ')}. `;
    }
    if(! names.length) {
        status += `No valid stop names to add.`
    } else {
        status += `Adding ${names.length} stop names to DB..`;
    }
    $('#nameStops_status').html(status);

    if(! names.length) return;

    let payload = { 
        "data": names
    };
    // stopsEntry
    $.ajax({
        url: `${APIpath}addStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            
            console.log(returndata);

            returndata.added.forEach((row,N) => {
                console.log(row);
                // add this stop to global allStops and allStopsi:
                allStopsi[row.stop_id] = { name: row.name, id: row.stop_id };
                allStops.push({ id: row.stop_id, name: name });

                // add this stop to the pattern
                addStop2Pattern(row.stop_id, redraw=false);

            });
            reNumber();
            routeLines(update=true);
            mapStops();
            
            $('#nameStops_status').html(`Added`);
            $('#savePattern_status').html(`${names.length} new stop names added to pattern, pls map them`);
            $('#modal_nameStops').modal('hide');
            patternChanged = true;
            
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#nameStops_status').html(jqXHR.responseText);
        }
    });
    // $('#modal_newStop').modal('hide');

}
// #################################
// ROUTE ON MAP

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
    // console.log(arr1);

    if(arr1.length < 2) {
        // alert("Less than 2 of the stops are mapped, so we cannot show the route on map. Pls add or map stops.");
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
        if(checklatlng(srow.latitude,srow.longitude)) {

            let tooltipContent = `${i}: ${srow.name}
            <br><small>${stop_ids[i-1]}</small>`;
            let popupContent = `${tooltipContent}<br>
            <button onclick="removeStop('${stop_ids[i-1]}')">Remove from pattern</button>`;

            var circleMarkerOptions = {
                renderer: myRenderer,
                radius: 5,
                fillColor: 'green',
                color: 'black',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            };

            let marker = L.marker([srow.latitude,srow.longitude], { 
                icon: L.divIcon({
                    className: `stop-divicon`,
                    iconSize: stopIconSize,
                    html: i
                }) 
            })
            .bindTooltip(tooltipContent, {direction:'top', offset: [0,-5]})
            .bindPopup(popupContent)
            .on('click', e=> {
                clickPatternStop(stop_ids[i-1]);
            });
            marker.properties = srow;
            marker.properties['id'] = stop_ids[i-1];
            marker.addTo(stopsLayer);
        } else {
            globalUnMappedStops.push(stop_ids[i-1]);
            $(`.unmapped.${stop_ids[i-1]}`).html(` (unmapped)`);
        }
    }
    if (!map.hasLayer(stopsLayer)) map.addLayer(stopsLayer);
}


// ########################
// MAP CONTEXT MENU

function route_newStop_popup(e) {
    globalClickLat = parseFloat(e.latlng.lat.toFixed(6));
    globalClickLon = parseFloat(e.latlng.lng.toFixed(6));

    $('#route_newStop_status').html(`Add a stop on ${globalClickLat},${globalClickLon}`);
    // trigger modal popup
    $('#modal_newStop').modal('show');
}


function route_newStop() {
    // this will come from the popup
    // dynamically create a new stop on the map, send it to backend, and add it to the pattern also
    // structure to add to allStops and allStopsi: 
    /*
    {"id": "ZG5KJCQ", "name": "4th Phase, KPHB 4th Phase", "latitude": 17.47122, "longitude": 78.38798 }
    "0-CSEKQ": {"name": "Mother Teresa Statue, Regimental Bazar / Mother Teresa Statue, Mother Teresa", "latitude": 17.43797, "longitude": 78.5046 }
    */
    let name = $('#newStop_name').val();
    if(!name) {
        $('#route_newStop_status').html(`You have to set a name.`);
        return;
    }
    let payload = { "data": [{
            "name": name,
            "latitude": globalClickLat, "longitude": globalClickLon
    }] };
    $('#route_newStop_status').html(`Adding the stop to DB..`);
    $.ajax({
        url: `${APIpath}addStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        processData: false,  // tell jQuery not to process the data
        contentType: 'application/json',
        success: function (returndata) {
            // now add it to the present pattern
            let pattern_id = $('#pattern_chosen').val();
            let stop_id = returndata.added[0]['stop_id'];
            // add this stop to global allStops and allStopsi:
            allStopsi[stop_id] = {id: stop_id, name: name, latitude: globalClickLat, 
                longitude: globalClickLon };
            allStops.push({id: stop_id, name: name, latitude: globalClickLat, 
                longitude: globalClickLon});

            // add this stop to the pattern
            addStop2Pattern(stop_id);
            
            $('#route_newStop_status').html(`Added`);
            $('#modal_newStop').modal('hide');
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#route_newStop_status").html(jqXHR.responseText);
            var message = JSON.parse(jqXHR.responseText)['message'];
            if(message) $("#route_newStop_status").html(message);
        }
    });
}


function route_unMappedStop_popup(e) {
    globalClickLat = parseFloat(e.latlng.lat.toFixed(6));
    globalClickLon = parseFloat(e.latlng.lng.toFixed(6));

    $('#route_UnMappedStop_status').html(`Add a stop on ${globalClickLat},${globalClickLon}`);

    if(!globalUnMappedStops.length) {
        $('#belowMap').html(`There aren't any unmapped stops in this pattern.`);
        return;
    }
    let content = ``;
    globalUnMappedStops.forEach(id => {
        content += `<option value="${id}">${allStopsi[id].name} (${id})</option>`;
    });
    $('#select_unmapped_stop').html(content);

    // trigger modal popup
    $('#modal_UnMappedStop').modal('show');
}

function route_UnMappedStop() {
    // this will come from the popup for mapping an unmapped stop.
    // dynamically map a previously unmapped stop on the map, send it to backend, update the allStopsi and update the mapped pattern
    let id = $('#select_unmapped_stop').val();
    if(!id) return;

    let payload = { "data":[{
        "stop_id": id,
        "latitude": globalClickLat, "longitude": globalClickLon
    }]};
    console.log(payload);
    $('#route_unMappedStop_status').html(`Mapping the stop in DB..`);
    $.ajax({
        url: `${APIpath}updateStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        processData: false,  // tell jQuery not to process the data
        contentType: 'application/json',
        success: function (returndata) {
            // add this stop to global allStops and allStopsi:
            allStopsi[id].latitude =  globalClickLat;
            allStopsi[id].longitude =  globalClickLon;
            // allStops.push({id: stop_id, name: name, latitude: globalClickLat, 
            //     longitude: globalClickLon});

            $(`.unmapped.${id}`).html('');
            // remove this stop id from globalUnMappedStops
            globalUnMappedStops = globalUnMappedStops.filter(x => {
                return x != id;
            })
            console.log("globalUnMappedStops:",globalUnMappedStops);
            patternChanged = true;
            reNumber();
            routeLines(update=true);
            mapStops();

            $('#route_unMappedStop_status').html(`Mapped`);
            $('#modal_UnMappedStop').modal('hide');
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#route_newStop_status").html(jqXHR.responseText);
            var message = JSON.parse(jqXHR.responseText)['message'];
            if(message) $("#route_unMappedStop_status").html(message);
        }
    });
}


// #################################
// OTHER ON-MAP SERVICES

function searchByAjax(text, callResponse){
    //callback for 3rd party ajax requests
    // from https://opengeo.tech/maps/leaflet-search/examples/ajax-jquery.html
    return $.ajax({
        url: '/API/searchStops',  //read comments in search.php for more information usage
        type: 'GET',
        data: {q: text},
        dataType: 'json',
        success: function(json) {
            callResponse(json);
        }
    });
}

map.addControl( new L.Control.Search({ 
        sourceData: searchByAjax, 
        text:'Searh a stop...', 
        markerLocation: true
    })
);


// #################################
// SUGGESTIONS

function clickPatternStop(stop_id) {
    if(!allStopsLoadedFlag) return;
    $('#suggestions').html(``);
    matchesLayer.clearLayers();

    globalSelectedStop = allStopsi[stop_id];
    console.log("clickPatternStop:",globalSelectedStop);
    $('#stopInfo').html(globalSelectedStop.name);
    if(globalSelectedStop.latitude) {
        map.panTo([globalSelectedStop.latitude, globalSelectedStop.longitude]);
        $('#unmappedHolder').html(``);
    } else {
        $('#unmappedHolder').html(`unmapped`);

    }

    // also find out which number in the pattern this is
    let pattern = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    globalStopNum = pattern.findIndex(p => {return p == stop_id});
    // findIndex: https://www.w3schools.com/jsref/jsref_findindex.asp
    if(globalStopNum < 0) globalStopNum=0; // if not found, assume zero
    globalStopNum ++;
    console.log("globalStopNum:",globalStopNum);

}

function loadSuggestions() {
    console.log("loadSuggestions:",globalSelectedStop);
    if(!globalSelectedStop.name) return;
    let bounds = map.getBounds();
    let payload = {
        "name": globalSelectedStop.name,
        "minLat": bounds._southWest.lat, 
        "maxLat": bounds._northEast.lat, 
        "minLon": bounds._southWest.lng, 
        "maxLon": bounds._northEast.lng, 
        // "fuzzy": true,
        // "accuracy": 0.7,
        // "maxRows": 10,
        "depot": $('#route_depot').val()
    };
    console.log(payload);
    $('#suggestions').html(`Loading..`);
    
    $.ajax({
        url: `${APIpath}suggestMatches`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            if(!returndata.hits) {
                $('#suggestions').html(`Could not find any suggestions. Try loosening the search criteria in settings.`);
                return;
            }
            
            let suggestionsHTML=``;
            matchesLayer.clearLayers();
            returndata.data.forEach(s => {
                let tooltipContent = `${s.name}`;
                let popupContent = `Suggested stop: <b>${s.name}</b><br>
                id: ${s.id}, similarity score: ${s.score.toFixed(3)}<br>
                <b><a href="javascript:{}" onclick=replacePatternStop('${globalSelectedStop.id}','${s.id}')>Click here</a></b>
                to replace current stop (${globalSelectedStop.id})<br> 
                in the pattern at position ${globalStopNum}
                `;
                let suggestMarker = L.circleMarker([s.latitude,s.longitude], {
                    renderer: myRenderer,
                    radius: 4,
                    fillColor: 'blue',
                    color: 'black',
                    weight: 0.5,
                    opacity: 1,
                    fillOpacity: 0.5
                }).bindTooltip(tooltipContent, {
                    direction:'top', 
                    offset: [0,-5]
                }).bindPopup(popupContent);
                suggestMarker.addTo(matchesLayer);

                suggestionsHTML += `<span class="border" onclick="map.panTo([${s.latitude},${s.longitude}])" class="suggestionPill">${s.name}</span>&nbsp;|&nbsp;`;

            });
            // console.log(suggestionsHTML);
            suggestionsHTML += `${returndata.hits} suggestions found`;
            $('#suggestions').html( suggestionsHTML );
            if (!map.hasLayer(matchesLayer)) map.addLayer(matchesLayer);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#suggestions').html(jqXHR.responseText);
        }
    });

}

function replacePatternStop(orig_id, new_id) {
    console.log("replacePatternStop:",orig_id, new_id);
    let stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    
    console.log(`Old stop: ${stop_ids[globalStopNum-1]}, checking: ${orig_id == stop_ids[globalStopNum-1]}`);
    stop_ids[globalStopNum-1] = new_id;
    console.log(`New stop: ${stop_ids[globalStopNum-1]}`);
    
    // re-making the pattern
    let sortableContent = '';
    stop_ids.forEach((id,N) => {
        sortableContent += makeStopDiv(id, allStopsi[id].name);
    });
    $('#stops_order_holder').html(sortableContent);
    reNumber();
    routeLines(update=true);
    mapStops();

    map.closePopup(); // close popup

}


function autoMapPattern() {
    if(globalNotMapped == 0) { 
        alert("All stops in this pattern are mapped already.");
        return;
    }
    if(!confirm(`Are sure? ${globalNotMapped} stops will be automatically mapped based on the current map extents. Press Cancel if you want to change the map view or so.`)) {
        return;
    }

    let pid = $('#pattern_chosen').val();
    let bounds = map.getBounds();
    let payload = {
        "pattern_id": pid,
        "autoMap": true,
        "minLat": bounds._southWest.lat, 
        "maxLat": bounds._northEast.lat, 
        "minLon": bounds._southWest.lng, 
        "maxLon": bounds._northEast.lng
    };
    $('#autoMapPattern_status').html(`Processing, please wait a few secs...`);
    $.ajax({
        url: `${APIpath}autoMapPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#autoMapPattern_status').html(`Automapping done. Reloading pattern..`);

            loadPattern(pid);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#autoMapPattern_status').html(jqXHR.responseText);
        }
    });
}