// print.js

// ######################################
/* GLOBAL VARIABLES */

const stopIconSize = [20, 20];
var URLParams = {}; // for holding URL parameters
var globalRoute = '';

var baseLayer = L.layerGroup(null);
var stopsLayer = L.geoJson(null);
var lineLayer = L.geoJson(null);

var globalLineCollector = [];
var globalRoutesList = [];

// #################################
/* MAPs */
// background layers, using Leaflet-providers plugin. See https://github.com/leaflet-extras/leaflet-providers
var base = {
    "CartoDB Positron": L.tileLayer.provider('CartoDB.Positron'),
    "CartoDB Voyager": L.tileLayer.provider('CartoDB.VoyagerLabelsUnder'),
    
    "OpenStreetMap": L.tileLayer.provider('OpenStreetMap.Mapnik'),
    "Esri WorldTopoMap": L.tileLayer.provider('Esri.WorldTopoMap'),
    "Esri WorldGrayCanvas": L.tileLayer.provider('Esri.WorldGrayCanvas'),
    
    "gStreets": L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']}),
    "gHybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3']}),
    "gSat": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{maxZoom: 20,subdomains:['mt0','mt1','mt2','mt3']}),
    
    "Stamen Toner": L.tileLayer.provider('Stamen.Toner'),
    "Stamen Toner-Lite": L.tileLayer.provider('Stamen.TonerLite'),
    "Stamen Watercolor": L.tileLayer.provider('Stamen.Watercolor'),
    "Stamen Terrain": L.tileLayer.provider('Stamen.Terrain'),
};
const defaultBase = "CartoDB Positron";

var map = new L.Map('map', {
    center: STARTLOCATION,
    zoom: STARTZOOM,
    layers: [base["CartoDB Positron"]],
    scrollWheelZoom: true, maxZoom: 18, zoomControl: false, zoomDelta: 0.1, zoomSnap:0.1
});
L.control.scale({position: 'bottomleft'}).addTo(map)
L.control.zoom({position: 'topleft'}).addTo(map);
baseLayer.addTo(map);
stopsLayer.addTo(map);
lineLayer.addTo(map);

// ############################################
// RUN ON PAGE LOAD
$(document).ready(function () {
    loadURLParams(URLParams);
    loadRoutesList();
    loadConfig();
});


// ############################################
// FUNCTIONS

function loadRoutesList() {
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
            $("#depot_select").selectize({
                closeAfterSelect: true,
                plugins: ['remove_button']
            });

            let selectizeOptgroups = [];
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
                searchField: ['name','depot', 'id'],
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
                        return;
                    }
                    loadRouteDetails(route_id);
                },
                onClear(){
                    console.log(`routes_list onClear event`);
                }
            });
            // load a route from URLParams
            if(URLParams['route']) {
                // var selectize = routeSelectize[0].selectize;
                $("#routes_list")[0].selectize.setValue(URLParams['route'],silent=false)
            }
            $('#route_status').html(`All routes loaded.`);
        },
        error: function(xhr, status, error) {
            // failure handler code
            console.log('loadRoutesList api failed')
        }
    });
}


function loadRouteDetails(route_id, pattern_id=null){
    $('#route_status').html(`Loading route id ${route_id}...`);
    let payload = { route_id: route_id };
    $.ajax({
        url: `/API/loadRouteDetails`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            globalRoute = returndata;

            // load patterns
            clearPattern();
            let patternsContent = '';
            returndata.patterns.forEach(r => {
                let sel = ``;
                if(pattern_id == r.id) sel = `selected="selected"`;
                patternsContent += `<option value="${r.id}" ${sel}>${r.name}</option>`;
            });
            $('#pattern_chosen').html(patternsContent);

            loadPattern($('#pattern_chosen').val());
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            // $('#route_status').html(jqXHR.responseText);
        }
    });
}


function loadPattern(pid) {
    
    console.log(`loadPattern: ${pid}`);
    lineLayer.clearLayers();
    stopsLayer.clearLayers();

    if(! pid) return;
    $('#route_status').html(`Loading pattern ${pid}..`);
    let patternHolder = globalRoute.patterns.filter(r => {return r.id === pid});
    if(!patternHolder.length) {
        console.log(`No patterns under route: ${globalRoute}`);
        return;
    }
    $('.pattern_selected').html(`${patternHolder[0].name}`);
    
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
            // console.log(returndata);
            mapPattern(returndata);
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            // $('#savePattern_status').html(jqXHR.responseText);
        }
    });
}

function mapPattern(returndata) {
    // stopsLayer.clearLayers();
    // let arr1 = [];
    let unmappedStops = [];
    let listHTML = ``;
    var fromStop = '', toStop = '';
    globalLineCollector = [];

    returndata.pattern_stops.forEach((p,i) => {
        if(checklatlng(p.latitude,p.longitude)) {
            globalLineCollector.push([p.latitude, p.longitude]);
            let tooltipContent = ``;
            let tooltipOptions = {permanent:false, direction:'right', offset:[20,0] };
            let popupContent = ``;
            var stopmarker = L.marker([p.latitude, p.longitude], { 
                icon: L.divIcon({
                    className: `stop-divicon`,
                    iconSize: stopIconSize,
                    html: ( parseInt(i)+1 )
                }) 
            })
            .bindTooltip(tooltipContent,tooltipOptions);
            stopmarker.properties = p;
            stopmarker.addTo(stopsLayer);
        } else {
            unmappedStops.push(p);
        }
        map.fitBounds(stopsLayer.getBounds(), {padding:[20,20], maxZoom:15});
        drawLine();
        listHTML += `<li>${i+1}. ${p.name}</li>`; // populate stops list
        $(`.stopsList`).html(listHTML);
        $('#route_status').html(`Route and pattern loaded`);
    });
}


function drawLine(color='black') {
    lineLayer.clearLayers();
    var polyOptions = { color:color };
    var poly = L.polyline(globalLineCollector, polyOptions);
    let spacer = Array(3).join(" "); // repeater. from https://stackoverflow.com/a/1877479/4355695
    // putting arrows. See https://github.com/makinacorpus/Leaflet.TextPath
    poly.setText(spacer+'>'+spacer, {repeat: true, offset: 6, attributes: {'font-weight': 'bold', 'font-size': '18', 'fill':color}}); // ►
    poly.addTo(lineLayer);
    
}

function changeColor() {
    let trackColor = $(`#trackColor`).val();
    let fontColor = $(`#fontColor`).val();
    let iconColor = $(`#iconColor`).val();
    // lineLayer.setStyle( {color:color} );
    // console.log(`color:${color}, fontColor:${fontColor}`);

    $(`.stop-divicon`).css('background-color',iconColor);
    $(`.stop-divicon`).css('color',fontColor);
    // re-do setText for arrows
    drawLine(trackColor);
}

function clearPattern() {

}