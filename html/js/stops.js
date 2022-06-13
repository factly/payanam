// ######################################
/* GLOBAL VARIABLES */

const normalColor = "blue";
const selectedColor = "yellow";


// Map: these layers need to have global scope, and are mentioned in tabulator constructors, hence need to be defined here.
var stopsLayer = new L.geoJson(null);

var globalAllStops = {};
var globalSelected = new Set();
var globalTrainsData = {};
var globalTrainsLines = {};
// var trainsLayer = new L.geoJson(null);
var globalUnmappedFlag = false;
// #################################
/* TABULATOR */

var stopsTotal = function(values, data, calcParams){
    var calc = values.length;
    return calc + ' total';
}

var stopsTable = new Tabulator("#stopsTable", {
    height: 500,
    selectable: true,
    tooltipsHeader: true, //enable header tooltips,
    index: "id",
    columns: [
        { title: "id", field: "id", headerFilter: "input", bottomCalc:stopsTotal },
        { title: "name", field: "name", headerFilter: "input" },
        { title: "lat", field: "latitude", headerFilter: "input" },
        { title: "lon", field: "longitude", headerFilter: "input" },
        { title: "descr", field: "description", headerFilter: "input" },
        { title: "group", field: "group", headerFilter: "input" }
    ]
});

stopsTable.on("rowSelected", function(row){
    let s = row.getData();
    if(s.latitude) {
        mapMoveHere(s.latitude, s.longitude);
        colorMap([s.id],selectedColor);
    }
    setupStopEditing(s.id, s.name);
    globalSelected.add(s.id);
    
});

stopsTable.on("rowDeselected", function(row){
    let s = row.getData();
    colorMap([s.id],normalColor);
});

// #################################
/* MAP */
var cartoPositron = L.tileLayer.provider('CartoDB.Positron');
var OSM = L.tileLayer.provider('OpenStreetMap.Mapnik');
var gStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
var gHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']});
var esriWorld = L.tileLayer.provider('Esri.WorldImagery');

var baseLayers = { "OpenStreetMap.org" : OSM, "Carto Positron": cartoPositron, "ESRI Satellite": esriWorld, 
    "gStreets": gStreets, "gHybrid": gHybrid };

var map = new L.Map('map', {
    center: STARTLOCATION,
    zoom: STARTZOOM,
    layers: [cartoPositron],
    scrollWheelZoom: true,
    maxZoom: 20,
});
$('.leaflet-container').css('cursor','crosshair'); // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
L.control.scale({metric:true, imperial:false}).addTo(map);

// SVG renderer
var myRenderer = L.canvas({ padding: 0.5 });

// Marker for positioning new stop or changing location of stop
var dragmarkerOptions = {
    //renderer: myRenderer,
    radius: 5,
    fillColor: "red",
    color: null,
    weight: 1,
    opacity: 1,
    fillOpacity: 0.8,
    interactive: false
};
var dragmarker = L.circleMarker(null, dragmarkerOptions);

var overlays = {
    "stops": stopsLayer,
    // "trains": trainsLayer
};
var layerControl = L.control.layers(baseLayers, overlays, {collapsed: true, autoZIndex:false}).addTo(map); 

// buttons on map
L.easyButton('<img src="lib/zoom-out.svg" width="100%" title="zoom to see all stops" data-toggle="tooltip" data-placement="right">', 
    function(btn, map){
    // if( routeTable.getDataCount(true) && mappedList.length )
    map.fitBounds(stopsLayer.getBounds(), {padding:[20,20], maxZoom:15});
}).addTo(map);

// L.easyButton('<img src="lib/route.svg" width="100%" title="toggle route lines" data-toggle="tooltip" data-placement="right">', 
//     function(btn, map){
//     // routeLines();
// }).addTo(map);

// https://github.com/Leaflet/Leaflet.fullscreen
map.addControl(new L.Control.Fullscreen({position:'topright'}));

L.control.custom({
    position: 'bottomright',
    content: `<span class="position"></span> | <span id="stopHolder"></span>`,
    classes: 'divOnMap_right'
}).addTo(map);

// L.control.custom({
//     position: 'bottomleft',
//     content: `<span id="map_id">Select a stop</span><br><div id="trainHolder"></div> `,
// classes: 'divOnMap_left'
// }).addTo(map);

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
    $('.position').html(`${currentLocation.lat.toFixed(4)},${currentLocation.lng.toFixed(4)}`);
});

// lat, long in url
var hash = new L.Hash(map);

const lasso = L.lasso(map); // lasso tool : https://github.com/zakjan/leaflet-lasso

// buttons on map
L.easyButton('<img src="lib/lasso.png" width="100%" title="Click to activate Lasso tool: Press mouse button down and drag to draw a lasso on the map around the points you want to select." data-toggle="tooltip" data-placement="right">', function(btn, map){
    lasso.enable();
}).addTo(map);

// ############################################
// RUN ON PAGE LOAD
$(document).ready(function () {
    loadStops();
    loadConfig();

    // Lasso selector
    map.on('lasso.finished', (event) => {
        // console.log(`${event.layers.length} saplings selected by lasso tool`);
        let ids = [];
        event.layers.forEach(element => {
            if(element.properties && element.properties.id) {
                ids.push(element.properties.id);
                
            }
        });
        if(ids.length) {
            console.log(`${ids.length} stops selected by lasso tool: ${ids}`);
            stopsTable.deselectRow();
            stopsTable.selectRow(ids);
            // colorMap(ids,selectedColor);
        }
        
    });

    map.on('lasso.disabled', (event) => {
        // lasso was making mouse cursor into hand after completion. So make it crosshairs again
        $('.leaflet-container').css('cursor','crosshair');
        // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
    });
});

// ############################################
// FUNCTIONS

/* template
$.ajax({
        url : `${APIpath}/getData1`,
        type : 'POST',
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success : function(returndata) {
            // will be already in json, no need to JSON.parse
            processData(returndata.data);
        },
        error: function(jqXHR, exception) {
            console.log('error:',jqXHR.responseText);
            alert(jqXHR.responseText);
        }
    });
*/

function loadStops() {
    let payload = {};
    $("#stopsTable_status").html(`Loading all stops..`);
    $.ajax({
        url: `/API/loadStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            stopsTable.setData(returndata['stops']);
            $("#stopsTable_status").html(`Loaded.`);
            mapStops(returndata['stops']);
          
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#stopsTable_status").html(jqXHR.responseText);
        },
    });
}

function mapStops(data) {
    var circleMarkerOptions = {
        renderer: myRenderer,
        radius: 5,
        fillColor: normalColor,
        color: 'black',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
    };
    var mapCounter = 0;
    stopsLayer.clearLayers();
    data.forEach(e => {
        // console.log(e);
        let lat = parseFloat(e.latitude);
        let lon = parseFloat(e.longitude);
        if(!checklatlng(lat,lon)) return;

        let tooltipContent = `${e.id}: ${e.name}`;
        let popupContent = `${e.name}<br>
            <button onclick="locateStop('${e.id}')">Locate in table</button> <small>${e.id}</small>
        `;
        // <button onclick="loadRoutes('${e.id}')">load routes</button>

        globalAllStops[e.id] = L.circleMarker([lat,lon], circleMarkerOptions)
            .bindTooltip(tooltipContent, {direction:'top', offset: [0,-5]})
            .bindPopup(popupContent);
        globalAllStops[e.id].properties = e;
        // globalAllStops[e.id].on('click',markerOnClick);
        globalAllStops[e.id].addTo(stopsLayer);
        mapCounter ++;
    });
    if (!map.hasLayer(stopsLayer)) map.addLayer(stopsLayer);
    console.log(`${mapCounter} stops mapped.`)
}

function addStop() {
    // 18.446,76.678 Bhatangali BANL
    var currentLocation = map.getCenter();

    let payload = {"data": [{ 
            // "id": $('#manual_id').val(), 
            "name": $('#manual_stop_name').val(),
            "latitude": parseFloat(currentLocation.lat.toFixed(6)),
            "longitude": parseFloat(currentLocation.lng.toFixed(6)),
            "description": $('#manual_description').val(),
            // "id": $('#manual_id').val().toUpperCase()
        }]
    };
    $('#addStop_status').html(`Sending...`);
    $.ajax({
        url: `/API/addStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        processData: false,  // tell jQuery not to process the data
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            $('#addStop_status').html(`Stop Added.`);
            loadStops();
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            var message = JSON.parse(jqXHR.responseText)['message'];
            if(message) $("#addStop_status").html(message);
            else $("#addStop_status").html(jqXHR.responseText);
        },
    });

}

function locateStop(id) {
    stopsTable.deselectRow();
    stopsTable.selectRow(id);
    stopsTable.scrollToRow(id, "center", false);
    var selectedData = stopsTable.getSelectedData();
    let name = selectedData[0].name;

    setupStopEditing(id, name);
}

// function loadRoutes(id=null) {
//     if(id) {
//         stopsTable.selectRow(id);
//         stopsTable.scrollToRow(id, "center", false);
//     } else {
//         var selected = stopsTable.getSelectedData();
//         if(! selected.length) return;
//         id = selected[0]['id'];
//     }
//     $('#map_id').html(`Loading routes for ${id}`);
//     $('#trainHolder').html(``);
//     $.ajax({
//         url: `/API/trains4stop?stop=${id}`,
//         type: "GET",
//         cache: false,
//         success: function (returndata) {
//             var result = JSON.parse(returndata);
//             $('#map_id').html(`${result.num} trains for ${id}`);
//             var content = ``;
//             globalTrainsData = result.sequence;
//             result.trains.forEach(t => {
//                 content += `<span onclick="showTrain('${t.trainNo}')">${t.trainNo}: ${t.trainName}</span><br>`;
//             })
//             $('#trainHolder').html(content);
//             mapTrains();
//         },
//         error: function (jqXHR, exception) {
//             console.log("error:", jqXHR.responseText);
//             // $("#stopsTable_status").html(jqXHR.responseText);
//         },
//     });

// }


// function mapTrains() {
//     trainsLayer.clearLayers();
//     globalTrainsLines = {};
//     console.log(globalTrainsData);
//     var counter = 0;
//     Object.entries(globalTrainsData).forEach(([key, arr]) => {
//         // console.log(key, arr);
//         var track = [];
//         arr.forEach(e => {
//             var lat = parseFloat(e.latitude);
//             var lon = parseFloat(e.longitude);
//             if(!checklatlng(lat,lon)) return;
//             track.push([lat, lon]);
//         })
//         globalTrainsLines[key] = L.polyline.antPath(track, {color: colorMix[counter], weight:3.5, 
//             interactive:false, delay:2000}).addTo(trainsLayer);
//         counter ++;
//         if(counter >= colorMix.length) counter=0;
//     });
//     if (!map.hasLayer(trainsLayer)) map.addLayer(trainsLayer);
// }


function mapMoveHere(lat,lon) {
    lat = parseFloat(lat);
    lon = parseFloat(lon);
    if( ! checklatlng(lat,lon) ) {
        console.log('mapMoveHere(): invalid lat-lon values:', lat,lon);
        return;
    }
    map.panTo([lat,lon], {/*duration:1,*/ animate:true});

}

function showTrain(trainNo) {
    console.log(trainNo);
    var seq = `Train ${trainNo} schedule:<br>sr - stnCode - dayCnt - depTime - distance<br>`;
    globalTrainsData[trainNo].forEach(r => {
        if(!r.latitude)
            seq += `<span onclick="setupStopEditing('${r.stnCode}')"><b>${r.sr} - ${r.stnCode} - ${r.dayCnt} - ${r.depTime} - ${parseInt(r.distance)} km</b></span><br>`
        else seq += `<span onclick="mapMoveHere(${r.latitude},${r.longitude})">${r.sr} - ${r.stnCode} - ${r.dayCnt} - ${r.depTime} - ${parseInt(r.distance)} km</span><br>`
        // seq += `${r.sr}\t${r.stnCode}\t${r.dayCnt}\t${r.depTime}\t${parseInt(r.distance)} km\n`;
    });
    $('#dump').html(seq);

    Object.entries(globalTrainsData).forEach(([key, arr]) => {
        if (key != trainNo) {
            if(trainsLayer.hasLayer(globalTrainsLines[key])) {
                console.log("removing",key);
                globalTrainsLines[key].removeFrom(trainsLayer);
            }
        }
        else {
            if(! trainsLayer.hasLayer(globalTrainsLines[key])) {
                console.log("showing",key);
                globalTrainsLines[key].addTo(trainsLayer);

            }
        }
    });
    
    // zoom map to the route 
    if(trainsLayer.getLayers().length) {
        map.flyToBounds(trainsLayer.getBounds(), { maxZoom: 11, duration: 0.5 });    
    }
    
}

function updateStopLocation(id) {
    console.log(id);
    
    var currentLocation = map.getCenter();
    var lat = parseFloat(currentLocation.lat.toFixed(6));
    var lon = parseFloat(currentLocation.lng.toFixed(6));

    var oldData = stopsTable.getRow(id).getData();
    console.log(oldData);
    var old_lat = parseFloat(oldData['latitude']);
    var old_lon = parseFloat(oldData['longitude']);
    var prevText = '';
    if (old_lat&&old_lon) prevText = `\nPrevious location: ${old_lat},${old_lon}`;

    if(! confirm(`Are you sure you want to set this: ${lat},${lon}\nas the new location for stop ${id}?${prevText}`))
        return;

    var name = $('#new_name').val();
    if(!name) {
        alert("Enter a stop name");
        return;
    }

    let payload = [{ 
        "update": true,
        "stop_id": id, 
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "description": `map_edit_${getTodayDate()}`
    }];
    console.log(payload);
    $('#updateStop_status').html(`Sending...`);
    $.ajax({
        url: `/API/addStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        processData: false,  // tell jQuery not to process the data
        contentType: 'application/json',
        success: function (returndata) {
            $('#updateStop_status').html(`Updated successfully.`);
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            var message = JSON.parse(jqXHR.responseText)['message'];
            if(message) $("#updateStop_status").html(message);
            else $("#updateStop_status").html(jqXHR.responseText);
        },
    });
    

}

function unmapped() {
    if(!globalUnmappedFlag) {
        stopsTable.setFilter("latitude", "=", null);
        globalUnmappedFlag = true;
    }
    else {
        stopsTable.clearFilter(true);
        globalUnmappedFlag = false;
    }
}

function setupStopEditing(id, name='') {
    $('#stopHolder').html(`<span id="id">${id}</span><br><input id="new_name" value="${name}" placeholder="stop name"><br>
            <button onclick="updateStopLocation('${id}')">Set new location</button><br>
            <span id="updateStop_status"></span><br>`);
}

function deleteStop() {
    $('#stopsTable_status').html('Checking..');
    let selectedData = stopsTable.getSelectedData();
    if(!selectedData.length) {
        console.log("Nothing selected.");
        return;
    }
    let idsList = [];
    selectedData.forEach(s => {
        idsList.push(s.id);
    });
    let payload = {
        "idsList": idsList
    };
    console.log(payload);

    $.ajax({
        url: `/API/diagnoseStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        processData: false,  // tell jQuery not to process the data
        contentType: 'application/json',
        success: function (returndata) {
            $('#stopsTable_status').html(`Fetched data on the selected stop(s).`);
            console.log(returndata);
            let question = `Are you sure you want to delete these stop(s)?`;
            if (returndata.patternCount && returndata.patternCount > 0) {
                question = `Are you sure you want to delete these stops? This will affect ${returndata.patternCount} patterns in ${returndata.routeCount} routes`;
            }
            
            if(confirm(question)) {
                $('#stopsTable_status').html(`Deleting the stop(s), pls wait..`);
                $.ajax({
                    url: `/API/deleteStopsConfirm`,
                    type: "POST",
                    data : JSON.stringify(payload),
                    cache: false,
                    processData: false,  // tell jQuery not to process the data
                    contentType: 'application/json',
                    success: function (returndata2) {
                        console.log(returndata2);
                        if (returndata.patternCount && returndata.patternCount > 0)
                            $('#stopsTable_status').html(`Deleted ${returndata2.stopCount} stop(s), ${returndata2.patternCount} pattern(s) in ${returndata2.routeCount} routes affected.`);
                        else 
                            $('#stopsTable_status').html(`Deleted ${returndata2.stopCount} stop(s)`);
                        loadStops();
                    },
                    error: function (jqXHR, exception) {
                        console.log("error:", jqXHR.responseText);
                        $("#stopsTable_status").html(jqXHR.responseText);
                    }
                });
            } else {
                $("#stopsTable_status").html(`Canceled deletion.`);
            }

        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#stopsTable_status").html(jqXHR.responseText);
        },
    });
}


function colorMap(idsList,chosenColor) {
    idsList.forEach(e => {
        if(globalAllStops[e]) {
            globalAllStops[e].setStyle({
                fillColor : chosenColor,
                fillOpacity : 1.0
            });
        }
    });
}
