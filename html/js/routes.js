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
var globalPatternCounter = 0;
var globalPatternStopLookup = {};

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

    $('#depot_select').change(function () {
        if (! $(this).val()) return;
        filterRoutesByDepot($(this).val());
    })
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
        url: `/API/loadRoutesList`,
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

            // format like https://stackoverflow.com/a/60733010/4355695
            // let selectizeOptions = [];
            let selectizeOptgroups = [];
            // returndata.routes.forEach(r => {
            //     selectizeOptions.push({depot: r.depot, value: r.id, name: r.name});
            // })
            // save in global var
            globalRoutesList = returndata.routes;
            returndata.depots.forEach(d => {
                selectizeOptgroups.push({value: d, label:d});
            });

            let routeSelectize = $('#routes_list').selectize({
                placeholder: "Choose a Route",
                options: returndata.routes,
                labelField: 'name',
                valueField: 'id',
                optgroups: selectizeOptgroups,
                optgroupField: 'depot',
                searchField: ['name','depot'],
                maxItems: 1,
                plugins: ['remove_button'], // spotted here: https://stackoverflow.com/q/51611957/4355695
                // plugins: ['optgroup_columns', 'remove_button'],
                render: {
                    optgroup_header: function(data, escape) {
                        return `<div class="optgroup-header">${escape(data.label)}</div>`;
                    }
                },
                onChange(route_id) {
                    console.log(`routeSelectize onChange event, route_id: ${route_id}`);
                    if(!route_id || !route_id.length) {
                        console.log('clearing things');
                        clearTimings();
                        clearUI();
                        clearRoute();
                        clearPattern();
                        return;
                    }
                    loadRouteDetails(route_id);
                    
                },
                onClear(){
                    console.log(`routes_list onClear event`);
                    clearTimings();
                    clearUI();
                    clearRoute();
                    clearPattern();
                }
            });
                
            $('#route_status').html(`All routes loaded.`);

            // load a route from URLParams
            if(URLParams['route']) {
                var selectize = routeSelectize[0].selectize;
                selectize.setValue(URLParams['route'],silent=false)
            }
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#route_status').html(jqXHR.responseText);
        }
    });
}

function filterRoutesByDepot(depot) {
    let newList = globalRoutesList.filter(r => {return r.depot === depot}); 
    console.log(`filterRoutesByDepot: after filtering by depot=${depot}, routes: ${newList.length}`);
    
    // clear selected, from https://stackoverflow.com/a/55047781/4355695
    // $('routes_list').find('.selectized').each(function(index, element) { element.selectize && element.selectize.clear() })
    $("#routes_list")[0].selectize.clear();

    // clear present routes list
    // var selectize = $('#routes_list')[0].selectize;
    $("#routes_list")[0].selectize.clearOptions(silent=true);
    $("#routes_list")[0].selectize.addOption(newList);

    // populate depot field in case creating new route
    $('#route_depot').val(depot);
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
            // console.log(returndata);
            globalRoute = returndata;
            $('#route_name').val(returndata.route.name);
            $('#route_description').val(returndata.route.description);
            $('#route_depot').val(returndata.route.depot);
            $('#routeActionButton').html(`Update route info`);

            // load patterns
            clearPattern();
            
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

            // change URL to have permalink to this route
            let plink = `?route=${route_id}#${map.getZoom()}/${map.getCenter().lat.toFixed(4)}/${map.getCenter().lng.toFixed(4)}`;
            history.pushState({page: 1}, null, plink);

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
    $('#pattern_chosen').html(``);
    $('#patterns_order_holder').html(``);

    $('#routeActionButton').html(`Create Route`);
}

// ####################################
// PATTERNS

function loadPattern(pid) {
    console.log(`loadPattern: ${pid}`);
    clearTimings();
    clearUI();
    let patternHolder = globalRoute.patterns.filter(r => {return r.id === pid});
    if(!patternHolder.length) {
        console.log(`No patterns under route: ${globalRoute}`);
        return;
    }
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
        url: `/API/loadPattern`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            // console.log("pattern_stops:",returndata.pattern_stops);
            clearUI();
            let sortableContent = '';
            globalNotMapped = 0;
            globalPatternStopLookup = returndata['id_stopId_lookup'];
            returndata.pattern_stops.forEach((r,N) => {
                sortableContent += makeStopDiv(r.stop_id, r.name, r.id);
                if(!r.latitude) globalNotMapped ++;
            });
            $('#stops_order_holder').html(sortableContent);
            reNumber();
            $('#savePattern_status').html(`Pattern ${pid} loaded. ${returndata.pattern_stops.length} stops total, ${globalNotMapped} not mapped yet.`);

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
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    let stops = [];
    pattern_stop_ids.forEach(pid => {
        if(globalPatternStopLookup[pid]) {
                stops.push(globalPatternStopLookup[pid]);
            }
    });
    let payload = {
        "pattern_id": $('#pattern_chosen').val(),
        "stops": stops
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
    globalPatternCounter = 0;
}

function clearPattern() {
    $('#pattern_add').val('');
    $('.pattern_selected').html(``);
    $('#stops_order_holder').html(``);
    $('#savePattern_status').html(``);

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

    $('#stopPicker').selectize({
        placeholder: "Add a Stop",
        plugins: ['remove_button'] // spotted here: https://stackoverflow.com/q/51611957/4355695
    });

    $('#stopPicker').change(function () {
        if (! $(this).val()) return;
        addStop2Pattern($(this).val());
    });

}

function addStop2Pattern(stop_id, redraw=true) {
    console.log("addStop2Pattern",stop_id);
    if(! $('#pattern_chosen').val() ) {
        console.log(`addStop2Pattern: No pattern chosen so cannot add a stop`);
        alert(`Please choose or add a pattern first.`);
        return;
    }
    let stopRow = allStopsi[stop_id];
    globalPatternCounter ++;
    globalPatternStopLookup[String(globalPatternCounter)] = stop_id; // add to global json
    let sortableContent = makeStopDiv(stop_id, stopRow.name, String(globalPatternCounter));
    $('#stops_order_holder').append(sortableContent);
    if(!redraw) return;
    reNumber();
    routeLines(update=true);
    mapStops();
    map.closePopup(); // close popup
    patternChanged = true;
}

function insertStopInPattern(stop_id, pos = null) {
    if(!pos) pos = parseInt($('#stopPosition').val());
    console.log("insertStopInPattern",stop_id, pos);
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();

    // redirect to simpler addStop2Pattern() if that applies
    if((!pos && pos!=0)|| pos=='' || pos>pattern_stop_ids.length || pos < 0 ) {
        addStop2Pattern(stop_id);
        return;
    }
    
    // new strategy : create just the new html div of the new stop and use jQuery insertBefore()
    globalPatternCounter ++;
    globalPatternStopLookup[String(globalPatternCounter)] = stop_id; // add to global json
    let patternEntry = makeStopDiv(stop_id, allStopsi[stop_id].name, String(globalPatternCounter));
    // from https://api.jquery.com/insertBefore/, https://stackoverflow.com/a/6149672/4355695
    $(patternEntry).insertBefore($(`.pattern_stop_${pattern_stop_ids[pos-1]}`));
    reNumber();
    routeLines(update=true);
    mapStops();

    $('#stopPosition').val('');
    map.closePopup(); // close popup
    patternChanged = true;


    // pattern_ids.splice(pos-1, 0, stop_id);
    // // console.log(stop_ids);
    // let sortableContent = '';
    // pattern_ids.forEach((id,N) => {
    //     sortableContent += makeStopDiv(globalPatternStopLookup[id], allStopsi[id].name, id);
    // });
    // $('#stops_order_holder').html(sortableContent);
    
}

function removeStop(id) {
    console.log("removeStop: pattern_stop_id:", id);
    $(`.pattern_stop_${id}`).remove();
    reNumber();
    routeLines(update=true);
    mapStops();
    patternChanged = true;

}

function makeStopDiv(stop_id, name, id) {
    // if(!sr) sr = $('#stops_order_holder').children().length + 1;
    let printname = name;
    if(name.length > 40) printname = name.substring(0,40) + '..';

    let sortableContent = `<div class="list-group-item stop_${stop_id} pattern_stop_${id}" data-id="${id}" title="${name}">
    <div onclick="clickPatternStop('${id}')"><span class="stopNum ${id}"></span>. ${printname} 
    <small>${stop_id}<span class="unmapped ${stop_id}"></span></small></div>
        
       
        <div class="removeStopButton" onclick="removeStop('${id}')">x</div>
        </div>`;
    // close button code from https://stackoverflow.com/a/33336458/4355695
    return sortableContent;

    /* <div class="timeOffsetHolder"><small>
            <input class="narrow" class="timeOffset ${stop_id}">min
        </small></div>
    */
}

function reNumber() {
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    pattern_stop_ids.forEach((id, N) => {
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
        url: `/API/loadPattern`,
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
    if(! $('#pattern_chosen').val() ) {
        console.log(`addStopsByNameOpenModal: No pattern chosen so cannot add stops`);
        alert(`Please choose or add a pattern first.`);
        return;
    }
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
        url: `/API/addStops`,
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
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    if(!pattern_stop_ids.length) return;

    if(patternLayer.getLayers().length && map.hasLayer(patternLayer) && !update) {
        // toggle off if already loaded and visible
        map.removeLayer(patternLayer);
        return;
    }
    patternLayer.clearLayers();

    let arr1 = [];
    pattern_stop_ids.forEach(pid => {
        let s = globalPatternStopLookup[pid];
        if(!s) return;

        let srow = allStopsi[s];
        if(!srow) return;        
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
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    if(!pattern_stop_ids.length) return;

    stopsLayer.clearLayers();
    let stopCounter = 0;

    for(let i=1;i<=pattern_stop_ids.length;i++) {
        let stop_id = globalPatternStopLookup[pattern_stop_ids[i-1]];
        if(!stop_id) continue;
        let srow = allStopsi[stop_id];
        if(!srow) continue;

        if(checklatlng(srow.latitude,srow.longitude)) {

            let tooltipContent = `${i}: ${srow.name}
            <br><small>${stop_id}</small>`;
            let popupContent = `${tooltipContent}<br>
            <button onclick="removeStop('${pattern_stop_ids[i-1]}')">Remove from pattern</button>`;

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
                clickPatternStop(pattern_stop_ids[i-1]);
            });
            marker.properties = srow;
            marker.properties['id'] = stop_id;
            marker.addTo(stopsLayer);
        } else {
            globalUnMappedStops.push(stop_id);
            $(`.unmapped.${stop_id}`).html(` (unmapped)`);
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
        url: `/API/addStops`,
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
        url: `/API/updateStops`,
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

function clickPatternStop(pattern_stop_id) {
    if(!allStopsLoadedFlag) return;
    $('#suggestions').html(``);
    matchesLayer.clearLayers();

    let stop_id = globalPatternStopLookup[pattern_stop_id];
    if(!stop_id) {
        console.log(`clickPatternStop: no stop_id found corresponding to ${pattern_stop_id} in globalPatternStopLookup`);
        return;
    }
    globalSelectedPatternStopId = pattern_stop_id;
    globalSelectedStop = allStopsi[stop_id];
    if(!globalSelectedStop) {
        console.log(`clickPatternStop: no stop row found corresponding to ${globalSelectedStop} in allStopsi`);
        return;
    }
    console.log("clickPatternStop:",globalSelectedStop);
    $('#stopInfo').html(globalSelectedStop.name);
    if(globalSelectedStop.latitude) {
        map.panTo([globalSelectedStop.latitude, globalSelectedStop.longitude]);
        $('#unmappedHolder').html(``);
    } else {
        $('#unmappedHolder').html(`unmapped`);

    }

    // also find out which number in the pattern this is
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    globalStopNum = pattern_stop_ids.findIndex(p => {return p == pattern_stop_id});
    // findIndex: https://www.w3schools.com/jsref/jsref_findindex.asp
    if(globalStopNum < 0) globalStopNum=0; // if not found, assume zero
    globalStopNum ++;
    console.log("globalStopNum:",globalStopNum, "globalSelectedPatternStopId:",globalSelectedPatternStopId );

}

function loadSuggestions() {
    console.log(`loadSuggestions: pattern_stop_id:${globalSelectedPatternStopId}, stop:${globalSelectedStop}`);
    if(!globalSelectedStop.name) return;
    let bounds = map.getBounds();
    let payload = {
        "name": globalSelectedStop.name,
        "minLat": bounds._southWest.lat, 
        "maxLat": bounds._northEast.lat, 
        "minLon": bounds._southWest.lng, 
        "maxLon": bounds._northEast.lng
        // "fuzzy": true,
        // "accuracy": 0.7,
        // "maxRows": 10
    };
    if($('#route_depot').val().length) payload['depot'] = $('#route_depot').val();
    console.log(payload);
    $('#suggestions').html(`Loading..`);
    
    $.ajax({
        url: `/API/suggestMatches`,
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
                <b><a href="javascript:{}" onclick=replacePatternStop('${globalSelectedPatternStopId}','${s.id}')>Click here</a></b>
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

function replacePatternStop(pattern_stop_id, new_stop_id) {
    console.log(`replacePatternStop: pattern_stop_id:${pattern_stop_id}, new_stop_id:${new_stop_id}`);
    let pattern_stop_ids = Sortable.get(document.getElementById('stops_order_holder')).toArray();
    
    // TO DO validation: ensure that pattern_stop_id is present in pattern_stop_ids array 

    // new strategy: use jquery replaceWith: https://api.jquery.com/replaceWith/
    globalPatternStopLookup[pattern_stop_id] = new_stop_id;
    newContent = makeStopDiv(new_stop_id, allStopsi[new_stop_id].name, pattern_stop_id);
    $(`.pattern_stop_${pattern_stop_id}`).replaceWith(newContent);

    reNumber();
    routeLines(update=true);
    mapStops();
    map.closePopup(); // close popup
    patternChanged = true;
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
        url: `/API/autoMapPattern`,
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