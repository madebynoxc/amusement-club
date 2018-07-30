module.exports = {
    connect, processRequest, getCollections, parseCollection, getByID
}

const dbManager = require("./dbmanager.js");
const utils = require("./localutils.js");
const react = require("./reactions.js");

var mongodb, cache = [];
var cardCollection;

function connect(db) {
    mongodb = db;
    getCollections();
    cardCollection = mongodb.collection('cards');
}

function processRequest(userID, args, channelID, callback) {
    var req = args.shift();
    switch(req) {
        case "info":
            if(args.length > 0)
                getInfo(userID, args.join(''), callback);
            break;
        case "update":
            if(dbManager.isAdmin(userID)) {
                getCollections().then(c => {
                    callback("Updated collection list. Found **" + c.length + "**");
                });
            }
            break;
        default:
            args.unshift(req);
            list(userID, args, channelID, callback);
    }
}

function list(userID, filters, channelID, callback) {
    let listed = [];

    if(filters)
        filters.map(f => 
            parseCollection(filters).map(c =>
                listed.push(c)));
    else listed = cache;

    if(listed.length == 0)
        return callback(utils.formatError(null, "Can't find collections matching that request"));

    let data = [];
    let count = 0;

    listed.sort(dbManager.dynamicSort("id")).map(c => {
        if(count % 15 == 0)
            data.push("");

        data[Math.floor(count/15)] += c.id + "\n";
        count++;
    });
    
    react.addNewPagination(userID, 
        "Found collections (" + listed.length + " overall):", data, channelID);
}

async function getInfo(userID, name, callback) {
    let col = parseCollection(name)[0];
    if(!col)
        return callback(utils.formatError(null, "Can't find collection matching that request"));

    let reqCol = col.special? mongodb.collection('promocards') : cardCollection;
    let colCardCount = await reqCol.count({collection: col.id});
    let awaitcard = await reqCol.aggregate([
        {"$match": {collection: col.id}},
        {"$sample": {size: 1}}
    ]).toArray();

    dbManager.getUserCards(userID, { "cards.collection": col.id }).toArray((err, objs) => {
        let userCardCount = objs[0]? objs[0].cards.length : 0;
        let card = awaitcard[0];
        let resp = "**" + col.name + "**\n";

        resp += "Overall cards: **" + colCardCount + "**\n";
        resp += "You have: **" + userCardCount + " (" + Math.round((userCardCount/colCardCount) * 100) + "%)**\n";
        resp += "Aliases: **" + col.aliases.join(" **|** ") + "**\n";
        //resp += col.compressed? "Uses JPG\n" : "Uses PNG\n";
        if(col.origin)
            resp += "[More information about fandom](" + col.origin + ")\n";

        resp += "Sample card:";
        callback(utils.formatImage(null, null, resp, dbManager.getCardURL(card)));
    });
}

function getCollections() {
    return new Promise((resolve) => {
        mongodb.collection('collections').find({}).toArray().then(c => {
            cache = c;
            resolve(c);
        });
    });
}

function parseCollection(str, special = true) {
    let cols = cache.filter(c => c.aliases.filter(a => a.includes(str)).length > 0);

    if(cols.length > 0 && !special) 
        cols = cols.filter(c => !c.special && c.id != 'special');

    return cols;
}

function getByID(id) {
    return cache.filter(c => c.id == id)[0];
}
