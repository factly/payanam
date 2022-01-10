// admin.js



// ###########################################################
// RUN ON PAGE LOAD
$(document).ready(function() {
    loadConfig(callbackFlag=true, callbackFunc=loadConfigSettings);
    
});


// ###########################################################
// FUNCTIONS

function loadConfigSettings() {
    console.log("loadConfigSettings");
    // globalConfig
    if(globalConfig['fuzzyFlag']) {
        $('#fuzzyFlag').val(globalConfig['fuzzyFlag']);
    }

    if(globalConfig['fuzzyDistance']) {
        $('#fuzzyDistance').val(globalConfig['fuzzyDistance']);
    }

}

function saveFuzzySettings() {
    console.log("saveFuzzySettings");
    var payload = { "data":[]};

    payload.data.push({ "key": "fuzzyFlag", "value": $('#fuzzyFlag').val() });

    payload.data.push({ "key": "fuzzyDistance", "value": parseFloat($('#fuzzyDistance').val())});
    
    $('#saveFuzzySettings_status').html("Saving..");
    console.log(payload);
    $.ajax({
        url: `/API/saveConfig`,
        type: "POST",
        data : JSON.stringify(payload),
        cache: false,
        contentType: 'application/json',
        success: function (returndata) {
            $('#saveFuzzySettings_status').html("Changes Saved.");
            
        },
        error: function (jqXHR, exception) {
            console.log("error:" + jqXHR.responseText);
            $('#saveFuzzySettings_status').html(jqXHR.responseText);
        }
    });
}