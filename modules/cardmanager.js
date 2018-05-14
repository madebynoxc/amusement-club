module.exports = {
    updateCards
}

var mongodb;
const fs = require('fs');
const logger = require('./log.js');
const url = "https://amusementclub.nyc3.digitaloceanspaces.com/";

function updateCards(connection, callback) {
    logger.message("[CardManager 2.3] NOW: Updating cards..."); 
    mongodb = connection;

    let collection = mongodb.collection('cards');
    let collection2 = mongodb.collection('promocards');
    collection.find({}).toArray((err, res) => {
        collection2.find({}).toArray((err2, res2) => {
            let allCards = res.concat(res2);
            fs.readdir('./cards', (err2, items) => {
                let collected = [];
                items.forEach(item => {
                    let newCards = [];
                    let path = './cards/' + item;
                    let files = fs.readdirSync(path);

                    for (let i in files) {
                        let ext = files[i].split('.')[1];

                        if(ext == 'png' || ext == 'jpg' || ext == 'gif') {
                            var card = getCardObject(files[i], item);
                            if (allCards.filter((e) => {
                                return e.name == card.name && e.collection === item.replace('=', '');
                            }).length == 0){
                                newCards.push(card);
                            }
                        } else  logger.error("Can't parse card: " + files[i]);
                    }
                    
                    if(item[0] == '=') 
                        insertCrads(newCards, mongodb.collection('promocards'));
                    else insertCrads(newCards, mongodb.collection('cards'));

                    if(newCards.length > 0) collected.push({name: item, count: newCards.length});
                });
                logger.message("[CardManager 2.3] Card update finished"); 
                if(callback) callback(collected);
            });
        });
    });
}

async function updateCardsS3(connection, callback) {
    logger.message("[CardManager S3.0] NOW: Updating cards..."); 
    mongodb = connection;

    let items = await getRemoteCardList();
    let allCards = (await mongodb.collection('cards').find({}).toArray())
        .concat((await mongodb.collection('promocards').find({}).toArray()));

    let collected = [];
    items.forEach(item => {
        let newCards = [];
        let path = './cards/' + item;
        let files = fs.readdirSync(path);

        for (let i in files) {
            let ext = files[i].split('.')[1];

            if(ext == 'png' || ext == 'jpg' || ext == 'gif') {
                var card = getCardObject(files[i], item);
                if (allCards.filter((e) => {
                    return e.name == card.name && e.collection === item.replace('=', '');
                }).length == 0){
                    newCards.push(card);
                }
            } else  logger.error("Can't parse card: " + files[i]);
        }
        
        if(item[0] == '=') 
            insertCrads(newCards, mongodb.collection('promocards'));
        else insertCrads(newCards, mongodb.collection('cards'));

        if(newCards.length > 0) collected.push({name: item, count: newCards.length});
    });
    logger.message("[CardManager S3.1] Card update finished"); 
    if(callback) callback(collected);
}

async function getRemoteCardList() {
    
}

function getCardObject(name, collection) {
    name = name.replace(/ /g, '_');
    let split = name.split('.');
    let craft = name.substr(1, 2) === "cr";

    collection = collection.replace('=', '');

    return {
        "name": craft? split[0].substr(4) : split[0].substr(2),
        "collection": collection,
        "level": parseInt(name[0]),
        "animated": split[1] === 'gif',
        "compressed": split[1] === 'jpg',
        "craft": craft
    }
}

function insertCrads(cards, collection) {
    if(cards.length == 0) return;

    var col = cards[0].collection;
    collection.insert(cards, (err, res) => {
        logger.message("> Inserted -- " + cards.length + " -- new cards from ["+ col +"] to DB");
    });
    logger.message("> [" + col + "] update finished");
}
