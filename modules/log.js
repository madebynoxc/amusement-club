module.exports = {
    message, error
}

const mkdirp = require('mkdirp');
const fs = require('fs');
const util = require('util');
const settings = require('../settings/general.json');

var log_file, log_err;

mkdirp(settings.logpath, function (err) {
    if (err) console.error("[Logger:ERROR] " + err);
    else {
        log_file = fs.createWriteStream(settings.logpath + 'message.log', {flags : 'w'});
        log_err = fs.createWriteStream(settings.logpath + 'error.log', {flags : 'w'});
        console.log("[Logger] Successful init for logging into files in " + settings.logpath);
    }
});

function message(str) {
    if(!log_file) return;

    log_file.write(getDateTime() + util.format(str) + '\n');
    console.log(str);
}

function error(str) {
    if(!log_err) return;

    log_err.write(getDateTime() + util.format(str) + '\n');
    console.log("[ERROR]: " + str);
}

function getDateTime() {
    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return "[" + year + "." + month + "." + day + "|" + hour + ":" + min + ":" + sec + "]: ";

}