module.exports = {
    connect, processRequest, getCollections, addCollection, parseCollection, getByID,
    getRandom, getClout, userHasAllCards 
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
        case "reset":
            if(args.length > 0)
                reset(userID, args.join(''), channelID, callback);
            break;
        default:
            args.unshift(req);
            list(userID, args, channelID, callback);
    }
}

async function list(userID, filters, channelID, callback) {
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

    //listed.sort(dbManager.dynamicSort("id")).map(async function(c) {
    for ( c of listed.sort(dbManager.dynamicSort("id")) ) {
        if(count % 15 == 0)
            data.push("");

        let clout = await getClout(userID, c.id);
        data[Math.floor(count/15)] += c.id + " "+ "✯".repeat(clout) + "\n";
        count++;
    };
    
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
    let clout = await getClout(userID, col.id);

    dbManager.getUserCards(userID, { "cards.collection": col.id }).toArray((err, objs) => {
        let userCardCount = objs[0]? objs[0].cards.length : 0;
        let card = awaitcard[0];
        let resp = "**" + col.name + "**\n";

        resp += "Overall cards: **" + colCardCount + "**\n";
        resp += "You have: **" + userCardCount + " (" + Math.floor((userCardCount/colCardCount) * 100) + "%)**\n";
        if ( clout > 0 )
            resp += "Clout: "+ "✯".repeat(clout) +"\n";
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

function addCollection(col, special = false, compressed = false) {
    return new Promise((resolve) => {
        mongodb.collection('collections').insert({
            id: col,
            name: col,
            origin: null,
            aliases: [col],
            special: special,
            compressed: compressed
        }).then(c => resolve(c));
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

// Return a random collection
function getRandom() {
    let r;
    //let cache2 = [{ "id" : "sailormoon" , "special":false}, { "id" : "attackontitan" , "special":false}, { "id" : "rezero" , "special":false}, { "id" : "steinsgate" , "special":false}, { "id" : "gochiusa" , "special":false}, { "id" : "dragonmaid" , "special":false}, { "id" : "clannad" , "special":false}, { "id" : "blends" , "special":false}, { "id" : "toarumajutsunoindex" , "special":false}, { "id" : "mahoutsukai" , "special":false}, { "id" : "special" , "special":false}, { "id" : "newgame" , "special":false}, { "id" : "yurucamp" , "special":false}, { "id" : "kakegurui" , "special":false}, { "id" : "nogamenolife" , "special":false}, { "id" : "housekinokuni" , "special":false}, { "id" : "killlakill" }];
    //do { r = cache2[Math.floor(Math.random()*cache2.length)]; }
    do { r = cache[Math.floor(Math.random()*cache.length)]; }
    while ( r.special || r.id == "special");
    return r;
}

// user-initiated collection reset
async function reset(userID, name, chanID, callback) {
    let col = parseCollection(name)[0];
    if(!col)
        return callback(utils.formatError(null, "Can't find collection matching that request"));
    react.addNewConfirmation(
        userID, 
        utils.formatWarning(null,'Caution:', '<@'+ userID +'>, you are about to '+ 
            'trade in one copy of each card you own in the '+ col.name +' collection for a clout star. Proceed?'), 
        chanID, 
        () => {
            reset2(userID, col, callback);
        }, 
        () => {
            callback(utils.formatError(null,'Aborted', '<@'+ userID +'>, Your collection was not reset.'));
        }
    )
}

// reset part two. called if the confirmation message is accepted.
async function reset2(userID, col, callback) {
    if ( await userHasAllCards(userID, col.id) ) {
        let userDoc = await mongodb.collection('users').findOne({"discord_id": userID});

        // Take one copy of each card in this collection from the user.
        for (let j=0; j<userDoc.cards.length; j++) {
            if ( userDoc.cards[j].collection == col.id ) {
                if ( userDoc.cards[j].amount > 1 )
                    userDoc.cards[j].amount--;
                else
                    userDoc.cards.splice(j,1);
            }
        }

        // Update "timesCompleted" and "notified"
        let completedCol = utils.obj_array_search(userDoc.completedCols, col.id, 'colID');
        completedCol.timesCompleted++;
        completedCol.notified = false;

        // Save changes.
        await mongodb.collection('users').save(userDoc);

        callback(utils.formatConfirm(null,"Success","Your _"+ col.name +"_ collection has been reset. You can collect the cards again and try to earn even more clout stars!"));
    } else {
        callback(utils.formatError(null,"Oops!","You must complete this collection before you can reset it."));
    }
}

// Returns the number of clout stars the given user has for the given col.
async function getClout(userID, colID) {
    let clout = 0;
    let completedColsRes = await mongodb.collection('users').findOne(
            { "discord_id": userID, "completedCols": {$exists: true} },
            { "completedCols":true });
    if ( completedColsRes && completedColsRes.completedCols ) {
        let completedCols = completedColsRes.completedCols;
        //console.log(JSON.stringify(completedCols));
        let completedCol = utils.obj_array_search(completedCols, colID, 'colID');
        //console.log(JSON.stringify(completedCol));
        if ( completedCol )
            clout = completedCol.timesCompleted;
    }
    return clout;
}

async function userHasAllCards(userID, colID) {
    let col = utils.obj_array_search(cache, colID);
    if ( !col ) return false;
    let reqCol = col.special? mongodb.collection('promocards') : cardCollection;
    let colCardCount = await reqCol.count({collection: colID});
    let userCards = await dbManager.getUserCards(userID, { "cards.collection": colID }).toArray();
    let userCardCount = userCards[0]? userCards[0].cards.length : 0;
    return userCardCount >= colCardCount;
}

