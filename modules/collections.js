module.exports = {
    connect, getCollections, parseCollection, getByID
}

var mongodb, cache = [];

function connect(db) {
    mongodb = db;
    getCollections();
}

function processRequest(userID, args, channelID, callback) {
    var req = args.shift();
    switch(req) {
        case undefined:
            showInventory(dbUser, callback);
        case "info":
            if(args.length > 0)
                getInfo(dbUser, args.join('_'), callback);
            break;
        case "use":
            if(args.length > 0)
                useItem(dbUser, args, channelID, callback);
            break;
        case "update":
            getCollections().then(c => {
                callback("Updated collection list. Found **" + c.length + "**");
            });
    }
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
