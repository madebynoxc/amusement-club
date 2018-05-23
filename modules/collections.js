module.exports = {
    connect, getCollections, parseCollection, getByID
}

var mongodb, cache = [];

function connect(db) {
    mongodb = db;
    getCollections();
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
