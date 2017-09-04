module.exports = {
    updateCards
}

var mongodb;
const fs = require('fs');
const logger = require('./log.js');

function updateCards(connection) {
    logger.message("Launched module [CardManager 2.0]"); 
    logger.message("NOW: Updating cards..."); 
    mongodb = connection;

    let collection = mongodb.collection('cards');
    collection.find({}).toArray((err, res) => {

        fs.readdir('./cards', (err2, items) => {
            items.forEach(item => {
                let newCards = [];
                let path = './cards/' + item;
                let files = fs.readdirSync(path);

                for (let i in files) {
                    var card = getCardObject(files[i], item);
                    if (res.filter((e) => {
                        return e.name == card.name && e.collection === item;
                    }).length == 0) {
                        newCards.push(card);
                    }
                }

                insertCrads(newCards);
            });
        });
    });
}

function getCardObject(name, collection) {
    let split = name.split('.');
    let craft = name.substr(1, 2) === "cr";

    return {
        "name": craft? split[0].substr(4) : split[0].substr(2),
        "collection": collection,
        "level": parseInt(name[0]),
        "animated": split[1] === 'gif',
        "compressed": split[1] === 'jpg',
        "craft": craft
    }
}

function insertCrads(cards) {
    if(cards.length == 0) return;

    var col = cards[0].collection;
    var collection = mongodb.collection('cards');
    collection.insert(cards, (err, res) => {
        logger.message("> Inserted -- " + cards.length + " -- new cards from ["+ col +"] to DB");
    });
    logger.message("> [" + col + "] update finished");
}