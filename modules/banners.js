
module.exports = {
    processRequest, connect
}

var mongodb, bannercol;
const settings = require('../settings/general.json');
const utils = require('./localutils.js');

function connect(db, client, shard) {
    mongodb = db;
    bot = client;
    bannercol = db.collection('banners');
}

function processRequest(user, args, channelID, callback) {
    if ( true ) {
        let command = args.shift();
        switch(command) {
            case 'add':
            case 'new':
            case 'create':
            case 'make':
                add(args, callback);
                break;
            case 'remove':
            case 'delete':
            case 'del':
                remove(args, callback);
                break;
            default:
                if ( command && command.toLowerCase() != "list" )
                    args.unshift(command);
                list(args, callback);
                break;
        }
    } else {
        list([], callback);
    }
}

async function remove(args, callback) {
    let id = args.shift();
    bannercol.remove({"id": id})
        .then(function(){callback("ok")})
        .catch(function(){calback("not ok")});
}

async function add(args, callback) {
    //args = args.join(' ').split(',');
    //for ( let i=0; i<args.length; i++ )
    //    args[i] = args[i].trim();
    let id = args.shift();
    let start = ""+ args.shift();
    start = start.split(/[-\/]/);
    let end = args.shift();
    end = end.split(/[-\/]/);
    let dupCheck = await bannercol.find({"id":id}).toArray();
    if ( dupCheck.length > 0 )
        callback("A banner with that ID already exists");
    else {
        bannercol.insert({
            "id": id,
            "start": new Date(start[2], start[1], start[0]),
            "end": new Date(end[2], end[1], end[0]),
        }).then(function(){callback("ok")})
        .catch(function(){calback("not ok")});
    }
}

async function list(args, callback) {
    let now = new Date();
    let showAll = args.shift() == "all"
    let query = {"start":{$lt:now}, "end":{$gt:now}};
    if ( showAll )
        query = {};
    let banners = await bannercol.find(query).toArray();
    if ( banners.length == 0 )
        if ( showAll )
            callback("There are no banners in the system, past, present, nor future.");
        else
            callback("There are no banners currently.");
    else {
        let out;
        if ( showAll )
            out = "All Focus-Banners:";
        else
            out = "Current Focus-Banners:";
        for ( banner of banners ) {
            if ( showAll ) {
                out += "\n - **"+ banner.id +"** _starts "+ 
                    utils.formatDateSimple(banner.start) +"_, _ends "+
                    utils.formatDateSimple(banner.end) +"_";
            } else {
                out += "\n - **"+ banner.id +"**  _ends "+ 
                    utils.formatDateSimple(banner.end) +"_";
            }
        }
        callback(out);
    }
}

