
module.exports = {
    processRequest, connect, findActive
}

var mongodb, bannercol;
const settings = require('../settings/general.json');
const utils = require('./localutils.js');

async function connect(db, client, shard) {
    mongodb = db;
    bot = client;
    bannercol = db.collection('banners');
}

async function processRequest(user, args, channelID, callback) {
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
            case 'alter':
            case 'modify':
            case 'edit':
            case 'change':
            case 'update':
                edit(args, callback);
                break;
            case 'help':
                help(args, callback);
                break;
            case 'info':
                let bannerId = args.shift();
                callback(await print(bannerId));
                break;
            case 'addcard':
            case 'addcards':
                addcards(args, callback);
                break;
            case 'removecard':
            case 'removecards':
                removecards(args, callback);
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

async function findActive() {
    let now = new Date();
    let query = {"start":{$lt:now}, "end":{$gt:now}};
    return await bannercol.find(query).toArray();
}

async function help(args, callback) {
    callback("Banner commands:\n"+

            "> `->banner add [id] [start] [end]`\n"+
            "Creates a new banner."+ 
            "\"id\" doubles as a name but cannot have spaces\n"+
            "\"start\" and \"end\" are dates with format DD/MM/YYYY\n\n"+

            "> `->banner edit [banner_id] [field_name] [new_value]`\n"+
            "Edits an existing banner.\n"+
            "\"field_name\"s include \"id\", \"start\", \"end\"\n\n"+
            
            "> `->banner remove [banner_id]\n\n"+
            "Deletes an existing banner.\n"+

            "> `->banner list`\n"+
            "Shows currently active banners.\n\n"+

            "> `->banner list all`\n"+
            "Shows all banners in the system (past, present, and future)\n\n"+

            "> `->banner addcards [banner_id] [card_query]`\n"+
            "Adds cards to the specified banner.\n"+
            "If an added card was in a different banner, it will be "+
            "removed from there.\n\n");
}

async function remove(args, callback) {
    let id = args.shift();
    mongodb.collection("cards").update({"banner":id},{$unset:{"banner":""}})
    bannercol.remove({"id": id})
        .then(function(){callback("ok")})
        .catch(function(){calback("not ok")});
}

async function add(args, callback) {
    let id = args.shift();
    let chance = parseFloat(args.shift());
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
            "chance": chance,
            "start": new Date(start[2], (start[1]-1), start[0]),
            "end": new Date(end[2], (end[1]-1), end[0]),
        }).then(async function(banner){callback(await print(id))})
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

async function edit(args, callback) {
    let id = args.shift();
    let targetField = args.shift();
    let banners = await bannercol.find({}).toArray();
    if ( !targetField || !banners[0][targetField] )
        callback("You must specify which field to edit: id, chance, start, or end");
    else {
        let newVal = args.shift();
        let newId = id;
        if ( targetField == "start" || targetField == "end" ) {
            newVal = newVal.split(/[-\/]/);
            newVal = new Date(newVal[2], (newVal[1]-1), newVal[0]);
        } else if ( targetField == "chance" ) {
            newVal = parseFloat(newVal)
        } else if ( targetField == "id" ) {
            newId = newVal;
            if ( await bannercol.findOne({"id":newId}) )
                return callback("There is already a banner with that ID");
            await mongodb.collection("cards").update(
                    {"banner":id}, {$set:{"banner":newId}} );
        }
        let setQuery = {};
        setQuery[targetField] = newVal;
        bannercol.updateOne({"id":id}, {$set: setQuery})
            .then(async function(banner) {
                let out = "Banner Updated:\n";
                out += await print(newId);
                callback(out);
            })
            .catch(function() { callback("not ok"); })
    }
}

async function addcards(args, callback) {
    let id = args.shift();
    let query = utils.getRequestFromFiltersNoPrefix(args);
    let banners = await mongodb.collection("banners").find({}).toArray();
    if ( !utils.obj_array_search(banners, id) )
        callback("no banner exists with that ID");
    else {
        mongodb.collection("cards").update(query,{$set:{"banner":id}})
            .then(function(){callback("ok")})
            .catch(function(){calback("not ok")});
    }
}

async function removecards(args, callback) {
    let id = args.shift();
    let query = utils.getRequestFromFiltersNoPrefix(args);
    let banners = await mongodb.collection("banners").find({}).toArray();
    if ( !utils.obj_array_search(banners, id) )
        callback("no banner exists with that ID");
    else {
        mongodb.collection("cards").update(query,{$unset:{"banner":""}})
            .then(function(){callback("ok")})
            .catch(function(){calback("not ok")});
    }
}

async function print(bannerId) {
    let banner = await bannercol.findOne({"id":bannerId});
    if ( banner ) {
        return "id: **"+ banner.id +"**\n"+ 
        "chance: **"+ (100*banner.chance) +"%**\n"+ 
        "start: **"+ utils.formatDateSimple(banner.start) +"**\n"+ 
        "end: **"+ utils.formatDateSimple(banner.end) +"**"; 
    } else 
        return "No such banner exists.";
}

