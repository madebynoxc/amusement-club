
module.exports = {
    processRequest, connect, findActive, listText
}

var mongodb, boostcol;
const settings = require('../settings/general.json');
const utils = require('./localutils.js');
const react = require('./reactions.js');
const dbmanager = require('./dbmanager.js');
const cardList = require('./list.js');

async function connect(db, client, shard) {
    mongodb = db;
    bot = client;
    boostcol = db.collection('boosts');
}

async function processRequest(user, args, channelID, callback) {
    let command = args.shift();
    if (command)
        command = command.toLowerCase();
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
            case 'info':
                let boostId = args.shift();
                callback(await print(boostId));
                break;
            case 'addcard':
            case 'addcards':
                addcards(args, callback);
                break;
            case 'deletecard':
            case 'deletecards':
            case 'removecard':
            case 'removecards':
                removecards(args, callback);
                break;
            case 'listcards':
            case 'showcards':
                listcards(user, args, channelID, callback);
                break;
            default:
                if(command && command != "list")
                    args.unshift(command);
                list(args, callback);
                break;
    }
}

async function findActive() {
    let now = new Date();
    let query = {"start":{$lt:now}, "end":{$gt:now}};
    return await boostcol.find(query).toArray();
}

async function remove(args, callback) {
    let id = args.shift();
    mongodb.collection("cards").update({"boost":id},{$unset:{"boost":""}})
    boostcol.remove({"id": id})
        .then(() => callback(utils.formatConfirm(null, null, "Boost was removed")))
        .catch(e => calback(utils.formatError(null, "An error occured", e)));
}

async function add(args, callback) {
    let id = args.shift();
    let chance = parseFloat(args.shift());
    let start = ""+ args.shift();
    start = start.split(/[-\/]/);
    let end = args.shift();
    end = end.split(/[-\/]/);
    let dupCheck = await boostcol.find({"id":id}).toArray();
    if (dupCheck.length > 0)
        callback(utils.formatError(null, "An error occured", "A boost with that ID already exists"));
    else {
        boostcol.insert({
            "id": id,
            "chance": chance,
            "start": new Date(start[2], (start[1]-1), start[0]),
            "end": new Date(end[2], (end[1]-1), end[0]),
        }).then(async function(boost){callback(await print(id))})
        .catch(e => calback(utils.formatError(null, "An error occured", e)));
    }
}

async function list(args, callback) {
    callback(utils.formatConfirm(null, "Currently active boosts", await listText(args)));
}

async function listText(args) {
    if (typeof(args) == "undefined")
       args = [];

    let now = new Date();
    let showAll = args.shift() == "all"
    let query = {"start":{$lt:now}, "end":{$gt:now}};
    if (showAll)
        query = {};

    let boosts = await boostcol.find(query).toArray();
    if (boosts.length == 0)
        if (showAll)
            return "There are no boosts in the system, past, present, nor future.";
        else
            return "There are no boosts currently.";
    else {
        let out;
        if (showAll)
            out = "All Claim Boosts:";
        else
            out = "Current Claim Boosts:";
        for ( boost of boosts ) {
            if ( showAll ) {
                out += "\n - **"+ boost.id +"** _starts "+ 
                    utils.formatDateSimple(boost.start) +"_, _ends "+
                    utils.formatDateSimple(boost.end) +"_";
            } else {
                let hoursLeft = Math.floor((boost.end - now)/(1000*60*60));
                let timeLeft;
                if ( hoursLeft == 0 )
                    timeLeft = "less than an hour";
                else if ( hoursLeft <= 24 )
                    timeLeft = hoursLeft +" hours";
                else {
                    let daysLeft = Math.floor(hoursLeft / 24);
                    hoursLeft = Math.floor(hoursLeft % 24);
                    timeLeft = daysLeft +" days, "+ hoursLeft +" hours";
                }
                out += "\n - **"+ boost.id +"**  _ends in "+ timeLeft +"_";
            }
        }
        return out;
    }
}

async function edit(args, callback) {
    let id = args.shift();
    let targetField = args.shift();
    let boosts = await boostcol.find({}).toArray();
    if ( !targetField || !boosts[0][targetField] )
        callback(utils.formatError(null, null, "You must specify which field to edit: id, chance, start, or end"));
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
            if ( await boostcol.findOne({"id": newId}) )
                return callback(utils.formatError(null, null, "There is already a boost with that ID"));
            await mongodb.collection("cards").update(
                    {"boost":id}, {$set:{"boost":newId}} );
        }

        let setQuery = {};
        setQuery[targetField] = newVal;
        boostcol.updateOne({"id":id}, {$set: setQuery})
            .then(async function(boost) {
                let out = "Boost Updated:\n";
                out += await print(newId);
                callback(utils.formatInfo(null, null, out));
            })
            .catch(() => callback(utils.formatError(null, "An error occured", e)));
    }
}

async function addcards(args, callback) {
    let id = args.shift();
    let query = utils.getRequestFromFiltersNoPrefix(args);
    let boosts = await mongodb.collection("boosts").find({}).toArray();
    if ( !utils.obj_array_search(boosts, id) )
        callback(utils.formatError(null, null, "No boost exists with that ID"));
    else {
        //console.log(JSON.stringify(query));
        mongodb.collection("cards").updateMany(query,{$set:{"boost":id}})
            .then(res => callback(utils.formatConfirm(null, null, `Added **${res.modifiedCount}** cards.`)))
            .catch(e => calback(utils.formatError(null, "An error occured", e)));
    }
}

async function removecards(args, callback) {
    let id = args.shift();
    let query = utils.getRequestFromFiltersNoPrefix(args);
    query["boost"] = id;
    let boosts = await mongodb.collection("boosts").find({}).toArray();
    if ( !utils.obj_array_search(boosts, id) )
        callback(utils.formatError(null, null, "No boost exists with that ID"));
    else {
        mongodb.collection("cards").updateMany(query,{$unset:{"boost":""}})
            .then(res => callback(utils.formatConfirm(null, null, `Removed **${res.modifiedCount}** cards.`)))
            .catch(e => calback(utils.formatError(null, "An error occured", e)));
    }
}

async function listcards(user, args, chanID, callback) {
    let id = args.shift();
    let boost = await boostcol.findOne({"id":id});
    if ( !boost )
        callback(utils.formatError(null, null, "No boost exists with that ID"));
    else {
        let cards = await mongodb.collection("cards").find({"boost":boost.id}).toArray();
        react.addNewPagination(user.id, 
            "Cards in the \""+ boost.id +"\" boost (" + cards.length + " results):", 
            cardList.getPages(cards), chanID);
    }
}

async function print(boostId) {
    let boost = await boostcol.findOne({"id": boostId});
    if (boost) {
        return utils.formatInfo(null, "Information about " + boostId, 
            `id: **${boost.id}**\n` + 
            `chance: **${(100*boost.chance)}%**\n` + 
            `start: **${utils.formatDateSimple(boost.start)}**\n` + 
            `end: **${utils.formatDateSimple(boost.end)}**`); 
    } else 
        return utils.formatError(null, null, "No boost exists with that ID");
}

