/* mappedStops.js */


// ######################################
/* 1. GLOBAL VARIABLES */
const stopsTable_height = "400px";
const uniqueStopsTable_height = "300px";

const normalColor = "blue";
const selectedColor = "yellow"

const lassoLimit = 50;
var tableData = [];
var chosenStops = [];
// var dataBank = [];

var globalAllStops = {};
var globalSelected = new Set();

// leaflet layers - need them global so all function can add to and remove from them.
var stopsLayer = new L.geoJson(null);
var depotsLayer = new L.geoJson(null); // for depots
var lineLayer = new L.geoJson(null);
var allMappedLayer = new L.geoJson(null);
// #################################
/* 2. Initiate tabulators */


// first, define custom functions that will be called by the table
var stopsTotal = function(values, data, calcParams){
    var calc = values.length;
    return calc + ' stops total';
}

var namesTotal = function(values, data, calcParams){
    var calc = values.length;
    return calc + ' unique names total';
}

//########################
// now the actual table construction
var uniqueStopsTable = new Tabulator("#uniqueStopsTable", {
    height:uniqueStopsTable_height,
    selectable:true,
    layout:"fitDataFill",
    addRowPos: "top",
    tooltipsHeader:true,
    index: "zap",
    columns:[ //Define Table Columns
        {title:"zap", field:"zap", headerFilter:"input", headerTooltip:"zap", width:100, headerSort:true },
        {title:"count", field:"count", headerFilter:"input", headerTooltip:"count", width:100, headerSort:true },
        {title:"names", field:"names", headerFilter:"input", headerTooltip:"names", width:150, headerSort:true, bottomCalc:namesTotal },
        //{title:"zap", field:"zap", headerFilter:"input", headerTooltip:"zap", width:150, headerSort:true },
        {title:"locs", field:"locations", headerFilter:"input", headerTooltip:"Number of Locations on Map", width:60, headerSort:true },
        // {title:"hull", field:"hull", headerFilter:"input", headerTooltip:"hull", width:70, headerSort:true },
        {title:"routes", field:"num_routes", headerFilter:"input", headerTooltip:"number of routes", width:120, headerSort:true },
        // {title:"num", field:"num_routes", headerFilter:"input", headerTooltip:"num_routes", width:70, headerSort:true },
        // {title:"depots", field:"depots", headerFilter:"input", headerTooltip:"depots", width:100, headerSort:true },
        // {title:"num", field:"num_depots", headerFilter:"input", headerTooltip:"num_depots", width:70, headerSort:true },
        /*
        {title:"direction_id", field:"direction_id", headerFilter:"input", headerTooltip:"direction_id", width:50, headerSort:false },
        {title:"stop_sequence", field:"stop_sequence", headerFilter:"input", headerTooltip:"stop_sequence", width:50, headerSort:false },
        {title:"longitude", field:"longitude", headerFilter:"input", headerTooltip:"longitude", width:50, headerSort:false },
        {title:"confidence", field:"confidence", headerFilter:"input", headerTooltip:"confidence", width:50, headerSort:false }
        */
    ]
});

uniqueStopsTable.on("rowClick", function(row){
    // empty the selection
    globalSelected.clear();
    filterStops();
    // other things to clear out:
    lineLayer.clearLayers();
});


// // dropdown for direction column. From https://github.com/olifolkerd/tabulator/issues/1011#issuecomment-476360437
// var select = $("<select><option value=''>(all)</option><option value='0'>Up(0)</option><option value='1'>Down(1)</option></select>");
// // note: below block is boilerplate code copied from tabulator. Do not distrurb!
// var selectEditor = function (cell, onRendered, success, cancel, editorParams) {
//     select.css({ "padding":"1px", "width":"100%", "box-sizing":"border-box" });
//     select.val(cell.getValue()); //Set value of select to the current value of the cell
//     onRendered(function(){ //set focus on the select box when the select is selected (timeout allows for select to be added to DOM)
//         select.focus();
//         select.css("height","100%");
//     });
//     //when the value has been set, trigger the cell to update
//     select.on("change blur", function(e){
//         success(select.val());
//     });
//     return select[0]; //return the select element // this needs to have [0] suffix
// }

var stopsTable = new Tabulator("#stopsTable", {
    height:stopsTable_height,
    selectable:true,
    layout:"fitDataFill",
    addRowPos: "top",
    tooltipsHeader:true,
    index: "id",
    columns:[ //Define Table Columns
        {title:"id", field:"id", headerFilter:"input", headerTooltip:"sr", width:100, headerSort:false },
        {title:"name", field:"name", headerFilter:"input", headerTooltip:"name", width:200, headerSort:true, bottomCalc:stopsTotal },
        {title:"lat", field:"latitude", headerFilter:"input", headerTooltip:"latitude", width:100, headerSort:true },
        {title:"lon", field:"longitude", headerFilter:"input", headerTooltip:"longitude", width:100, headerSort:true },
        {title:"routes", field:"num_routes", headerFilter:"input", headerTooltip:"number of routes this stop is used in", width:120, headerSort:true },
        {title:"grid", field:"grid", headerFilter:"input", headerTooltip:"OpenLocationCode grid", width:120, headerSort:true },
        //{title:"zap", field:"zap", headerFilter:"input", headerTooltip:"zap", width:150, headerSort:true },
        // {title:"route", field:"routeName", headerFilter:"input", headerTooltip:"Route Name", width:100, headerSort:true },
        // {title:"depot", field:"depot", headerFilter:"input", headerTooltip:"depot", width:50, headerSort:true, headerVertical:true },
        // {title:"direction", field:"direction_id", headerFilter:"input", headerTooltip:"direction_id", width:70, headerSort:false, headerFilter:selectEditor },
        // {title:"conf", field:"confidence", headerFilter:"input", headerTooltip:"confidence", width:40, headerSort:true, headerVertical:true },
        // {title:"seq", field:"stop_sequence", headerFilter:"input", headerTooltip:"stop_sequence", width:40, headerSort:false, headerVertical:true }
    ]
});

stopsTable.on("rowSelected", function(row){
    colorMap(row.getData().id,selectedColor);
    globalSelected.add(row.getData().id);
    countSelectedStops();
    $('#stopHolder').html(`<b>${row.getData().id}</b> ${row.getData().name}`);
});

stopsTable.on("rowDeselected", function(row){
    colorMap(row.getData().id,normalColor);
    globalSelected.delete(row.getData().id);
    countSelectedStops();
});

//     rowClick:function(e, row){
//         let data = row.getData();
//         let lat = parseFloat( data.latitude );
//         let lng = parseFloat( data.longitude );
//         if (lat && lng)
//             map.panTo([lat,lng]);
//     },
//     rowContext:function(e, row){
//         e.preventDefault(); // prevent the browsers default context menu form appearing.
//         console.log('Right-click capture!');
//     },
// });


// #################################
/* 3. Initiate map */
// background layers, using Leaflet-providers plugin. See https://github.com/leaflet-extras/leaflet-providers
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
    maxZoom: 20
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
//layerControl.addOverlay(dragmarker , "Marker");

var overlays = {
    "Mapped Stops": stopsLayer,
    "depots": depotsLayer,
    // "Mapillary Photos": mapillaryLayer,
    "Marker" : dragmarker,
    "Route Line": lineLayer,
    // "All Mapped Stops": allMappedLayer
};

var layerControl = L.control.layers(baseLayers, overlays, {collapsed: true, autoZIndex:false}).addTo(map); 

// https://github.com/Leaflet/Leaflet.fullscreen
map.addControl(new L.Control.Fullscreen({position:'topright'}));

const lasso = L.lasso(map); // lasso tool : https://github.com/zakjan/leaflet-lasso

// buttons on map
L.easyButton('<img src="lib/lasso.png" width="100%" title="Click to activate Lasso tool: Press mouse button down and drag to draw a lasso on the map around the points you want to select." data-toggle="tooltip" data-placement="right">', 
    function(btn, map){
    lasso.enable();
}).setPosition('bottomleft').addTo(map);

L.easyButton('<img src="lib/zoom-out.svg" width="100%" title="zoom to see all stops in top table" data-toggle="tooltip" data-placement="right">', function(btn, map){
    // if( stopsTable.getDataCount(true) )
    if( stopsLayer.getLayers().length )
        map.fitBounds(stopsLayer.getBounds(), {padding:[20,20], maxZoom:15});
}).addTo(map);


// Leaflet.Control.Custom : add custom HTML elements
// see https://github.com/yigityuce/Leaflet.Control.Custom
// L.control.custom({
//     position: 'bottomleft',
//     content: `<select id="routeLineSelect"><option value="">Pick a route</option></select><br>
//         <span id="routeLineStatus">Preview route</span> | <a href="javascript:;" onclick="jump2Mapper()">Edit</a>`,
//     classes: 'divOnMap1'
// }).addTo(map);

// L.control.custom({
//     position: 'bottomright',
//     content: ``,
//     classes: 'divOnMap2'
// }).addTo(map);

/*
<a onclick="openMapillary()" href="javascript:;">fetch nearby Mapillary pics</a><br>
<span id="mapillaryStatus"></span><br>
<a onclick="toggleLayer()" href="javascript:;">toggle All Mapped stops</a>
*/

// L.control.custom({
//     position: 'bottomright',
//     content: ``,
//     classes: 'divOnMap2'
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
    crosshair.setLatLng(map.getCenter());
});

// lat, long in url
var hash = new L.Hash(map);

// info box
L.control.custom({
    position: 'bottomright',
    content: `<span id="stopHolder"></span>`,
    classes: 'divOnMap_right'
}).addTo(map);

// #####################################################################
// RUN ON PAGE LOAD

$(document).ready(function() {
    
    // $.ajaxSetup({ cache: false }); // from https://stackoverflow.com/a/13679534/4355695 to force ajax to always load from source, don't use browser cache. This prevents browser from loading old route jsons.
    loadConfig(callbackFlag=false, depotFlag=true);
    // loadDefaults(callbackFlag=true, callbackFunc=loadDataBank);
    loadUniqueStops();
    // loadStops(which='mapped',first=true);

    $(window).resize(function(){
        stopsTable.redraw();
    });

    // load depots
    // loadDepots();

    map.on('lasso.finished', (event) => {
        console.log(`${event.layers.length} stops selected by lasso tool`);
        // sanity check
        if(event.layers.length > lassoLimit) {
            alert(`${event.layers.length} stops selected by lasso? This doesn't seem right. please zoom in and make a smaller selection.`);
            return;
        }
        
        $('#reconcileStatus').html(``);
        event.layers.forEach(element => {
            if(element.properties && element.properties.id) {
                stopsTable.selectRow(element.properties.id);
            }
            // note: take care to ensure that this only takes stops from stopsLayer. By default it grabs whatever's there, irrespective of layer. Currently, this entails that no other layer should have feature.properties set.
        });
    });

    map.on('lasso.disabled', (event) => {
        // lasso was making mouse cursor into hand after completion. So make it crosshairs again
        $('.leaflet-container').css('cursor','crosshair');
        // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
    });

    map.on('click', function(e) {
        map.panTo(e.latlng);
        dragmarker.setLatLng(e.latlng);
        if (!map.hasLayer(dragmarker)) map.addLayer(dragmarker);
        let lat = Math.round(e.latlng.lat*100000)/100000;
        let lon = Math.round(e.latlng.lng*100000)/100000;
        $("#recon_loc").val(`${lat},${lon}`);
    });

    // $('#routeLineSelect').on('change', function (e) {
    //     let holder = this.value;
    //     if(!holder.length) {
    //         lineLayer.clearLayers(); // clear out the presently loaded stuff
    //         return;
    //     }
    //     let parts = holder.split('|');
    //     drawLine(parts[0],parts[1],parts[2]);
    
    // });

    // $('#chooseMode').on('change', function (e) {
    //     console.log(this.value);
    //     resetEverything();
    //     loadUniqueStops(this.value);
    //     loadStops(this.value);
    // });

    $('#targetStopSelect').on('change', function(e) {
        let target_id = this.value;
        if(!target_id) {
            $('#newStop_div').show();
        }
        else {
            $('#newStop_div').hide();
        }
    });
    
});



// ############################################
// JS FUNCTIONS

function loadUniqueStops() {

    stopsTable.clearData();
    uniqueStopsTable.clearData();
    stopsTable.clearFilter(true);
    uniqueStopsTable.clearFilter(true);
    $('#newStop_div').show();

    let payload = {"main":true, "indexed":false, "unique":true};
    $("#stopsTable_status").html(`Loading..`);
    $.ajax({
        url: `/API/loadStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            uniqueStopsTable.setData(returndata['unique']);
            stopsTable.setData(returndata['stops']);
            $("#stopsTable_status").html(`Loaded.`);
            mapStops();
          
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#stopsTable_status").html(jqXHR.responseText);
        },
    });
    /*
    // var filename = 'stops_mapped_unique.csv';
    var filename = `stops_${which}_unique.csv`;
    

    Papa.parse(`reports/${filename}?_=${(new Date).getTime()}`, {
        download: true,
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true, // this reads numbers as numerical; set false to read everything as string
        complete: function(results, file) {
            uniqueStopsTable.setData(results.data);
            //$('#status').html(``);
        },
        error: function(err, file, inputElem, reason) {
            console.log(`${filename} not found. please run reports generation script once.`);
        }
    });
    */
}

// function loadStops(which='mapped',first=false) {
//     $('#status').html(`Loading..`);
//     // var filename = 'stops_mapped.csv';
//     var filename = `stops_${which}.csv`;
//     stopsTable.clearData();

//     Papa.parse(`reports/${filename}?_=${(new Date).getTime()}`, {
//         // using ..new Date.. here because each time we load this we want a fresh copy.
//         download: true,
//         header: true,
//         skipEmptyLines: true,
//         complete: function(results, file) {
//             stopsTable.setData(results.data);
//             $('#status').html(``);
//             /*
//             // extra: if called on page load, then store everything in an all-stops layer
//             if(first) {
//                 //allMappedLayer
//                 setTimeout(function(){ mapStops(false); }, 2000); 
//             }*/
//         },
//         error: function(err, file, inputElem, reason) {
//             console.log(`${filename} not found. please run reports generation script once.`);
//         }
//     });
// }

function mapStops(normal=true) {
    if(normal) tableData = stopsTable.getData("active");
    // else tableData = dataBank; // hack: push in the databank instead if this is a databank function call

    console.log('Displaying',tableData.length,'stops on map.'); 
    // confirm if filter is working
    // if(!normal) console.log('Running mapStops() function for loading up the databank.');

    if(normal) stopsLayer.clearLayers();
    // else allMappedLayer.clearLayers();

    for (i = 0; i < tableData.length; i++) {
        let stoprow = tableData[i];

        let lat = parseFloat(stoprow['latitude']);
        let lon = parseFloat(stoprow['longitude']);
        
        if( ! checklatlng(lat,lon) ) {
            // console.log('Skipping a stop because of invalid values:', stoprow);
            continue;
        }

        var circleMarkerOptions = {
            renderer: myRenderer,
            radius: normal ? 5 : 3,
            // fillColor: directionDecide(stoprow),
            fillColor: normal ? 'blue' : 'orange',
            color: 'silver',
            weight: 0.5,
            opacity: normal? 1 : 0,
            fillOpacity: 0.5
        };

        var automappedFlag = '';
        // console.log('confidence:',stoprow.confidence)
        // if( normal && stoprow.confidence == '0') automappedFlag = '&nbsp;&nbsp;(automapped)';
        var tooltipContent = `${stoprow.id}: ${stoprow.name}<br>${stoprow.num_routes} routes`;
        var stopmarker = L.circleMarker([lat,lon], circleMarkerOptions).bindTooltip(tooltipContent);
        if(normal) stopmarker.properties = stoprow; // doing this to prevent the lasso tool from selecting from the allMappedLayer
        
        if(normal) stopmarker.on('click',markerOnClick);
        
        if(normal) stopmarker.addTo(stopsLayer);
        // else stopmarker.addTo(allMappedLayer);

    }
    if (normal && !map.hasLayer(stopsLayer)) map.addLayer(stopsLayer);

}

function filterStops() {
    var selectedUniques = uniqueStopsTable.getSelectedData();
    if(!selectedUniques.length) return;

    $('#uniqueSelectStatus').html(selectedUniques.length);
    names = []

    // 5.4.19 : Changing matching by name to matching by 'zap'.
    selectedUniques.forEach(element => {
        names.push(element.zap);
    });
    //names = ['Tanda','Kondapur'];
    console.log(names);

    // constructing filter array for Tabulator. the sibling items in this array are in OR relationship with each other.
    filterArray = [];
    names.forEach(element => {
        filterArray.push({ field:"zap", type:"=", value:element });
    });
    
    stopsTable.setFilter([filterArray]);
    mapStops();
}

function colorMap(id,chosenColor) {
    let fillOpacity = 0.5;
    if(chosenColor == selectedColor) fillOpacity = 1.0;

    stopsLayer.eachLayer( function(layer) {
        if(layer.properties && (layer.properties.id == id) ) {
            layer.setStyle({
                fillColor : chosenColor,
                fillOpacity : fillOpacity
            });
            if(chosenColor == selectedColor) layer.bringToFront();
            else layer.bringToBack();
        }
    });
    
}

function markerOnClick(e) {
    // when a stop is clicked on map, show it in the table.
    if(e.target.properties && e.target.properties.id) {
        id = e.target.properties.id;
        stopsTable.scrollToRow(id, "top", false);

        if(globalSelected.has(id)) {
            $('#targetStopSelect').val(id).trigger('change');
        }
    }
}

function clearSelections(which="unique") {
    if(which == "unique") {
        uniqueStopsTable.deselectRow();
        $("#uniqueSelectStatus").html("0");
    } else {
        stopsTable.deselectRow();
    }
    $("#recon_name").val(""); // reset the reconciled stop name as we're moving to next work item
    $("#recon_loc").val(""); 
    $("#recon_description").val(""); 
}


function countSelectedStops() {
    let data = stopsTable.getSelectedData();
    $(".stopSelectStatus").html(data.length );
    // let routeSelectOptions  = ['<option value="">Pick a route</option>'];
    console.log(data);
    let content = '';
    let dropDownContent = `<option value="">Create New</option>`;
    data.forEach(element => {
        content += `${element.id}: ${element.name} ${element.latitude? `${element.latitude}/${element.longitude}`: '(unmapped)'}\n`;
        dropDownContent += `<option value="${element.id}">${element.id}: ${element.name}</option>`
        // let dropDownTitle = `${element.depot}|${element.jsonFile}|${element.direction_id}`;
        // routeSelectOptions += `<option value="${dropDownTitle}|">${dropDownTitle}</option>`;
        // routeSelectOptions.push(`<option value="${dropDownTitle}|">${dropDownTitle}</option>`);
    });
    $("#reconcillationPreview").val(content);
    $('#targetStopSelect').html(dropDownContent);

    // get rid of duplicates for routeSelectOptions
    // from https://stackoverflow.com/a/14438954/4355695 , 
    // var uniqueRouteSelectOptions = routeSelectOptions.filter((v, i, a) => a.indexOf(v) === i); 
    // $('#routeLineSelect').html(uniqueRouteSelectOptions);
    // lineLayer.clearLayers();

    /* lets not mess with the lat-longs, can lead to disasters
    if(data.length) {
        $("#recon_loc").val(`${data[0].latitude},${data[0].longitude}`);
        if(! $("#recon_name").val().length) $("#recon_name").val(data[0].name);
    } else {
        // $("#recon_name").val(''); // hey keep the name
        $("#recon_loc").val('');
    }
    */

}

function stopsSelectAll() {
    // doing this because the default way seems to be getting into unnecessary loops/processing.
    var rows = stopsTable.getRows("active");
    rows.forEach(element => {
        element.select();
    });
}

function combineStops() {
    if(!confirm(`Are you sure you want to combine these ${globalSelected.size} stops into one?`)) {
        return;
    }
    let payload = {};
    payload['idsList'] = Array.from(globalSelected);
    if(payload['idsList'].length < 2) {
        alert("Please select multiple stops to combine first");
        return;
    }

    let target_id = $('#targetStopSelect').val();
    if(target_id) {
        payload['target_id'] = target_id;
    } else {
        payload['new_name'] = $('#recon_name').val();
        let loc = $("#recon_loc").val().split(',');
        if(!$('#recon_name').val() || loc.length != 2) {
            alert(`If combining to a new stop, please fill the name and location correctly.`);
            return;
        }
        payload['new_latitude'] = parseFloat(loc[0]);
        payload['new_longitude'] = parseFloat(loc[1]);
        if(!checklatlng(payload['new_latitude'],payload['new_longitude'])) {
            alert(`Invalid new lat-longs, please click a point on the map for new stop's location`);
            return;
        }
        if($('#recon_description').val().length) payload['new_description'] = $('#recon_description').val();
    }

    console.log("reconcileSubmit", payload);

    $('#reconcileStatus').html('Combining Stops...');
    $.ajax({
        url: `/API/combineStops`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            
            // empty the selection
            globalSelected.clear();

            let status = `Combined, ${returndata['deleted_stops']} stops removed, made changes in ${returndata['replace_count']} patterns.`;
            if(returndata['new_stop_id']) status += `<br>New stop_id: ${returndata['new_stop_id']}`;
            status += `<br><button onclick="loadUniqueStops()">Click to reload</button>`;
            $('#reconcileStatus').html(status);
        },
        error: function (jqXHR, exception) {
            console.log("error:", jqXHR.responseText);
            $("#stopsTable_status").html(jqXHR.responseText);
        },
    });

}

function resetEverything() {
    clearSelections("stops");
    stopsTable.clearFilter(true);
    clearSelections();
    uniqueStopsTable.clearFilter(true);
    $('#reconcileStatus').html("");
    stopsLayer.clearLayers();
    lineLayer.clearLayers();
    // mapillaryLayer.clearLayers();
    
    $('#reconcileStatus').html(``);
    // MBlight.addTo(map);
    map.flyTo(STARTLOCATION,STARTZOOM);
    mapStops();
}

function drawLine(folder,jsonFile,direction_id) {
    console.log("Fetching route:",folder,jsonFile,direction_id);
    $('#routeLineStatus').html('loading..');
    lineLayer.clearLayers();
    // 28.5.19: Intervention: load the route's json directly instead of bothering the server.
    $.getJSON(`routes/${folder}/${jsonFile}?_=${(new Date).getTime()}`, function(data) {
        // putting timestamp at end so that new json is loaded every time.
        lineLayer.clearLayers(); // clear me baby one more time
        if(! Array.isArray(data[`stopsArray${direction_id}`])) {
            $('#mapStatus').html('No lat-longs available for this route.');
            return;
        }
        var collector = [];
        data[`stopsArray${direction_id}`].forEach(row => {
            let lat = parseFloat(row['latitude']);
            let lon = parseFloat(row['longitude']);
            if(checklatlng(lat,lon)) collector.push([lat,lon]);
        });
        var routeLine = L.polyline.antPath(collector, {color: stopOnwardColor, weight:3, delay:1000, interactive:false }).addTo(lineLayer);
        if (!map.hasLayer(lineLayer)) map.addLayer(lineLayer);
        //map.fitBounds(lineLayer.getBounds(), {padding:[0,0], maxZoom:15});
        console.log("Fetched route:",folder,jsonFile,direction_id);
        $('#routeLineStatus').html('Preview route');

    }).fail(function(err) {
        $('#routeLineStatus').html('Failed to fetch route');
    });

}

function jump2Mapper() {
    let code = $('#routeLineSelect').val();
    if(!code.length) return;
    let parts = code.split('|');
    let jumpRoute = `${parts[0]}/${parts[1]}`;
    console.log('jump2Mapper:',jumpRoute);
    // open in new window - copied from routes overview page's js
    var win = window.open(`routeMap.html?route=${jumpRoute}`, '_blank');
    win.focus();
}

function pickFirst(what='location') {
    let data = stopsTable.getSelectedData();
    if(!data.length) return;

    if(what == 'location') {
        let lat = parseFloat(data[0]['latitude']);
        let lon = parseFloat(data[0]['longitude']);
        if(checklatlng(lat,lon))
            $("#recon_loc").val(`${lat},${lon}`);
        else $("#recon_loc").val(``);
    } else {
        $("#recon_name").val(data[0]['name']);
    }
}

function toggleLayer(which="allMapped") {
    if(which == "allMapped")
        if (!map.hasLayer(allMappedLayer)) map.addLayer(allMappedLayer);
        else map.removeLayer(allMappedLayer);
}

// function loadDataBank(data) {
//     var filename = data['databanksList']["Mapped Stops"]; // "reports/stops_mapped_databank.csv"
//     console.log('databank: ',filename);

//     Papa.parse(`${filename}?_=${globalRandom}`, {
//         download: true,
//         header: true,
//         skipEmptyLines: true,
//         dynamicTyping: true, // this reads numbers as numerical; set false to read everything as string
//         complete: function(results, file) {
//             // uniqueStopsTable.setData(results.data);
//             //$('#status').html(``);
//             dataBank = results.data;
//             mapStops(false);
//         },
//         error: function(err, file, inputElem, reason) {
//             console.log(`${filename} not found. please run reports generation script once.`);
//         }
//     });
// }
