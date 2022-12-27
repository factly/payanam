/* routesOverview.js
*/

// ######################################
/* 1. GLOBAL VARIABLES */
const routes_height = "500px";
var URLParams = {}; // for holding URL parameters

var patternLayer = new L.geoJson(null);

// #################################
/* 2. Initiate tabulators */

// first, define custom functions that will be called by the 
var routesTotal = function(values, data, calcParams){
	var calc = values.length;
	return calc + ' routes total';
}

var progressbar = {
    min:0,
    max:100,
    color:["#ffff66", "lightblue"],
    legend: true,
    legendColor:"black",
    legendAlign:"center",
};

//custom formatter definition : moved to common.js

var routes_tabulator = new Tabulator("#routes", {
    height: routes_height,
    selectable:1,
    layout:"fitDataFill",
    //responsiveLayout:"collapse",
	tooltipsHeader:true,
    index: "route_id",
    columns:[
        {title:"sr", field:"sr", headerFilter:"input", headerTooltip:"serial number", width:15, headerSort:true, frozen:true },
        {title:"depot", field:"depot", headerFilter:"input", headerTooltip:"depot", width:75, headerSort:true },
        {title:"route<br>Name", field:"route_name", headerFilter:"input", headerTooltip:"routeName", width:100, headerSort:true, headerVertical:false, bottomCalc:routesTotal },
        {title:"Mapped %", field:"mapped_pc", headerFilter:"input", headerTooltip:"mapped %", width:50, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar },

        // icon : jump to routeMap.html with URL params
        {title: "Edit", formatter:editIcon, width:40, align:"center", headerVertical:true, cellClick:function(e, cell){
            let route_id = cell.getRow().getData()['route_id'];
            var win = window.open(`routes.html?route=${route_id}`, '_blank');
            win.focus();
        }},
        {title:"Stops", field:"num_stops", headerFilter:"input", headerTooltip:"number of stops (both directions)", width:55, headerSort:true,headerVertical:true },
        //{title:"trip times", field:"timings", headerTooltip:"if route has trips", width:50, headerSort:false, headerVertical:true, formatter:"tickCross", formatterParams:{crossElement:false} },
        // {title:"Trips", field:"num_trips", headerTooltip:"trips", width:50, headerSort:true, headerVertical:true, formatter:tickIcon },
        {title:"Patterns", field:"num_patterns", headerTooltip:"Number of Patterns", width:50, headerSort:true, headerVertical:true },
        {title:"Trips", field:"num_trips", headerTooltip:"trips", width:50, headerSort:true, headerVertical:true },
        {title:"Hull", field:"hull_sum", headerTooltip:"convex hull area", width:50, headerSort:true, headerVertical:true },
        // {title: "Print", formatter:printIcon, width:40, align:"center", headerVertical:true, cellClick:function(e, cell){
        //     let row = cell.getRow().getData();
        //     let jumpRoute = `${row['folder']}/${row['jsonFile']}`;
        //     var win = window.open(`print.html?route=${jumpRoute}`, '_blank');
        //     win.focus();
        // }},
        // {title:"services", field:"service", headerFilter:"input", headerTooltip:"services", width:100, headerSort:true },
        // {title:"avg confidence", field:"avgConfidence", headerFilter:"input", headerTooltip:"avg confidence", width:70, headerSort:true, headerVertical:true },
        // {title:"% autoMapped", field:"autoMapped%", headerFilter:"input", headerTooltip:"autoMapped%", width:70, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar },
        //{title:"% manually", field:"manuallyMapped%", headerFilter:"input", headerTooltip:"manuallyMapped%", width:70, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar },
        //{title:"hull", field:"hull", headerFilter:"input", headerTooltip:"higher number indicates there may be mis-mapped stops in the route", width:70, headerSort:true, headerVertical:true },
        //{title:"% onward", field:"mapped%0", headerFilter:"input", headerTooltip:"mapped%0", width:70, headerSort:true, headerVertical:true },
        //{title:"% return", field:"mapped%1", headerFilter:"input", headerTooltip:"mapped%1", width:70, headerSort:true, headerVertical:true },
        //{title:"bus Type", field:"busType", headerFilter:"input", headerTooltip:"busType", width:60, headerSort:true, headerVertical:true },
        // {title:"jsonFile", field:"jsonFile", headerFilter:"input", headerTooltip:"jsonFile", width:140, headerSort:true },
    ],
 //    rowSelected:function(row){ //when a row is selected
        
 //        // let stuff = row.getData();
 //        // drawLine(stuff['folder'],stuff['jsonFile']);
	// }
});



// ########################
// LEAFLET MAP
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
    // contextmenu: true,
    // contextmenuWidth: 140,
    // contextmenuItems: [
    //     { text: 'Add a new Stop here', callback: route_newStop_popup },
    //     { text: 'Map an unmapped Stop here', callback: route_unMappedStop_popup }
    // ]
});

$('.leaflet-container').css('cursor','crosshair'); // from https://stackoverflow.com/a/28724847/4355695 Changing mouse cursor to crosshairs
L.control.scale({metric:true, imperial:false, position: "bottomright"}).addTo(map);

// layers
var overlays = {
    "Route patterns": patternLayer
};
var layerControl = L.control.layers(baseLayers, overlays, {collapsed: true, autoZIndex:false}).addTo(map); 


// SVG renderer
var myRenderer = L.canvas({ padding: 0.5 });
map.addControl(new L.Control.Fullscreen({position:'topright'}));

L.easyButton('<img src="lib/zoom-out.svg" width="100%" title="zoom to fit" data-toggle="tooltip" data-placement="right">', function(btn, map){
    if( lineLayer.getLayers().length )
		map.fitBounds(patternLayer.getBounds(), {padding:[0,0], maxZoom:15});
}).addTo(map);

// Leaflet.Control.Custom : add custom HTML elements
// see https://github.com/yigityuce/Leaflet.Control.Custom
L.control.custom({
	position: 'bottomleft',
	content: `<div id="mapStatus">Click on a route to preview it.</div>`,
	classes: 'divOnMap1'
}).addTo(map);


// ########################
// RUN ON PAGE LOAD
$(document).ready(function() {
    loadURLParams(URLParams);
    loadConfig();

    routesOverview();



    routes_tabulator.on("rowSelected", function(row) {
        rdata = row.getData();
        mapRoute(rdata);
    });

    // loadDefaults();
    // loadRoutes();

    // ###########
    // Listeners for the checkboxes, to toggle columns on or off in tabulator table
    // $('#autoMapped').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"% Auto-<br>Mapped", field:"autoMapped%", headerFilter:"input", headerTooltip:"autoMapped%", width:50, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("autoMapped%"); // use the field, luke, use the field!
    //     }
    // });

    // $('#manuallyMapped').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"% Manually<br>Mapped", field:"manuallyMapped%", headerFilter:"input", headerTooltip:"manuallyMapped%", width:50, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("manuallyMapped%"); // use the field, luke, use the field!
    //     }
    // });

    // $('#hull').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"Convex<br> &nbsp; Hull", field:"hull", headerFilter:"input", headerTooltip:"higher number indicates there may be mis-mapped stops in the route", width:50, headerSort:true, headerVertical:true };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("hull"); // use the field, luke, use the field!
    //     }
    // });

    // $('#filename').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"filename", field:"jsonFile", headerFilter:"input", headerTooltip:"jsonFile", width:120, headerSort:true };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("jsonFile"); // use the field, luke, use the field!
    //     }
    // });

    // $('#busType').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"Bus<br>Type", field:"busType", headerFilter:"input", headerTooltip:"busType", width:80, headerSort:true, headerVertical:false };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("busType"); // use the field, luke, use the field!
    //     }
    // });

    // $('#onwardMapped').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"Onward %<br>Mapped", field:"mapped%0", headerFilter:"input", headerTooltip:"Onward journey % mapped", width:50, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("mapped%0"); // use the field, luke, use the field!
    //     }
    // });

    // $('#returnMapped').on('change', e => {
    //     if(e.target.checked) {
    //         let col = {title:"Return %<br>Mapped", field:"mapped%1", headerFilter:"input", headerTooltip:"Return journey % mapped", width:50, headerSort:true, headerVertical:true, formatter:"progress", formatterParams: progressbar };
    //         routes_tabulator.addColumn(col, false);
    //     } else {
    //         routes_tabulator.deleteColumn("mapped%1"); // use the field, luke, use the field!
    //     }
    // });


});


//#####################################
// API Call functions

function routesOverview() {
    $('#status').html(`Loading routes...`);
    let payload = {};
    $.ajax({
        url: `/API/routesOverview`,
        type: "GET",
        // data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            let tableData = Papa.parse(returndata.routes_stats, {header:true, skipEmptyLines:true, dynamicTyping:true}).data;
            console.log(tableData);
            routes_tabulator.setData(tableData);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            // $('#status').html(jqXHR.responseText);
        }
    });

}

function mapRoute(rdata) {
    let route_id = rdata.route_id;
    console.log(route_id);
    patternLayer.clearLayers();

    let pattern_names = rdata.patterns.split(',');
    $('#mapStatus').html(`<b>${rdata.route_name}</b> <small>(${rdata.route_id})</small><br>
        ${rdata.num_stops} stops, ${rdata.mapped_pc}% mapped<br>
        ${rdata.num_trips} trips<br>
        ${rdata.num_patterns} patterns:<br> ${pattern_names.join('<br>')}
    `);

    $.ajax({
        url: `/API/getRouteShapes?route_id=${route_id}`,
        type: "GET",
        // data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            console.log(returndata);
            let precision = returndata.precision || 6;

            returndata.patterns.forEach((p,i) => {
                let coords = polyDecode(p.geoline, precision);
                
                let tooltipContent = `${p.pattern_name}`;
                let percentMap = (p.mapped_stops / p.total_stops * 100).toFixed(1);
                let popupContent = `Pattern <b>${p.pattern_name}</b> in ${rdata.route_name}<br><b>${percentMap}%</b> mapped (${p.mapped_stops}/${p.total_stops}`;
                // decide color
                let N = i;
                if(i >= lineColors.length) {
                    N = 0;
                }
                var routeLine = L.polyline.antPath(coords, {color: lineColors[i], weight:4, delay:1000 })
                    .bindTooltip(tooltipContent, {sticky:true})
                    .bindPopup(popupContent);
                routeLine.addTo(patternLayer);
            });
            if (!map.hasLayer(patternLayer)) map.addLayer(patternLayer);
            map.fitBounds(patternLayer.getBounds(), {padding:[0,0], maxZoom:15});
        
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            // $('#status').html(jqXHR.responseText);
        }
    });
}


// function drawLine(folder,jsonFile,direction_id="0") {
//     console.log("Fetching route:",folder,jsonFile,direction_id);
//     $('#mapStatus').html('Loading..');
//     lineLayer.clearLayers();
//     // 28.5.19: Intervention: load the route's json directly instead of bothering the server.
//     $.getJSON(`routes/${folder}/${jsonFile}?_=${(new Date).getTime()}`, function(data) {
//         // putting timestamp at end so that new json is loaded every time.
//         lineLayer.clearLayers(); // clear me baby one more time
//         if(! Array.isArray(data[`stopsArray${direction_id}`])) {
//             $('#mapStatus').html('No lat-longs available for this route.');
//             return;
//         }
//         var collector = [];
//         data[`stopsArray${direction_id}`].forEach(row => {
//             let lat = parseFloat(row['stop_lat']);
//             let lon = parseFloat(row['stop_lon']);
//             if(checklatlng(lat,lon)) collector.push([lat,lon]);
//         });
//         var routeLine = L.polyline.antPath(collector, {color: 'red', weight:4, delay:1000, interactive:false }).addTo(lineLayer);
//         if (!map.hasLayer(lineLayer)) map.addLayer(lineLayer);
//         map.fitBounds(lineLayer.getBounds(), {padding:[0,0], maxZoom:15});
//         $('#mapStatus').html(`Loaded ${folder} / ${jsonFile}<br>onward direction. <a href="routeMap.html?route=${folder}/${jsonFile}" target="_blank"><b>Click to Edit</b></a>`);

//     }).fail(function(err) {
// 		$('#mapStatus').html('No lat-longs available for this route.');
// 	});
// }


// ############################################
// JS FUNCTIONS
// function loadRoutes(which='progress') {
//     $('#status').html(`Loading..`);
//     var filename = '';
//     if(which == 'all') filename = 'routes.csv';
//     if(which == 'progress') filename = 'routes_inprogress.csv';
//     if(which == 'locked') filename = 'routes_locked.csv';

// 	Papa.parse(`reports/${filename}?_=${(new Date).getTime()}`, {
//         // a "cache buster" to force always load from disk instead of cache, from https://stackoverflow.com/a/48883260/4355695
// 		download: true,
// 		header: true,
// 		skipEmptyLines: true,
// 		complete: function(results, file) {
//             // Intervention: pre-process, check for timings and just put true/false like flags for tript times and frequency
//             results.data.forEach(row => {
//                 timeFlag = false
//                 freqFlag = false
//                 // checks
//                 if (row.hasOwnProperty('t0.trip_times')) { if(row['t0.trip_times'].length > 2) timeFlag = true; }
//                 if (row.hasOwnProperty('t1.trip_times')) { if(row['t1.trip_times'].length > 2) timeFlag = true; }

//                 if (row.hasOwnProperty('t0.frequency')) { if(parseInt(row['t0.frequency']) > 0) freqFlag = true; }
//                 if (row.hasOwnProperty('t1.frequency')) { if(parseInt(row['t1.frequency']) > 0) freqFlag = true; }

//                 row['timings']=timeFlag;
//                 row['frequency']=freqFlag;
//             });
//             routes_tabulator.setData(results.data);
//             $('#status').html(`Loaded ${filename}.<br>
//                 <a href="reports/${filename}">Click to download</a>`);
//         },
//         error: function(err, file, inputElem, reason) {
//                 $('#status').html(`Could not load ${filename}, check reports folder.`);
//         },
// 	});
// }
