module.exports = {
    updateCards, updateCardsS3
}

var mongodb;
const fs = require('fs');
const logger = require('./log.js');
const utils = require("./localutils.js");
const https = require('https');
const validExts = ['.png', '.gif', '.jpg'];
const url = "https://amusementclub.nyc3.digitaloceanspaces.com";

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

function updateCardsS3(connection) {
    return new Promise(async (resolve) => {
        logger.message("[CardManager S3.0] NOW: Updating cards..."); 
        mongodb = connection;

        let items = await getRemoteCardList(); //cards/dragonmaid/1_Chinese_Dragon.png
        let allCards = (await mongodb.collection('cards').find({}).toArray())
            .concat((await mongodb.collection('promocards').find({}).toArray()));

        let collected = [], warnings = [], newCards = [], newPromoCards = [];
        items.forEach(item => {
            let type = item.split('/')[0];
            let collection = item.split('/')[1];
            let name = item.split('/')[2];

            if(name && collection) {
                let card = getCardObject(name, collection);

                if(card.name !== name.split('.')[0])
                    warnings.push(card.name + " : " + name.split('.')[0]);

                if(allCards.filter(c => utils.cardsMatch(c, card)) == 0) {
                    if(type == 'promo') newPromoCards.push(card);
                    else if(type == 'cards') newCards.push(card);

                    let col = collected.filter(c => c.name == collection)[0];
                    if(!col) collected.push({name: collection, count: 1});
                    else col.count++;
                }
            }
        });

        if(newCards.length > 0) 
            await insertCrads(newCards, mongodb.collection('cards'));
        if(newPromoCards.length > 0) 
            await insertCrads(newPromoCards, mongodb.collection('promocards'));
        logger.message("[CardManager S3.1] Card update finished"); 

        resolve({ collected: collected, warnings: warnings });
    });
}

async function getRemoteCardList() {
    return new Promise((resolve) => {

        https.get(url + '?max-keys=100000', (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                resolve(data
                    .split('<Key>')
                    .slice(1)
                    .map(e => e.split('</Key>')[0])
                    .filter(e => validExts
                        .map(ext => e.indexOf(ext) !== -1)
                        .reduce((a, b) => a || b)));
            });

        }).on("error", err => {
            console.log("HTTP Error: " + err.message);
        });  
    });
}

function getCardObject(name, collection) {
    name = name
        .replace(/ /g, '_')
        .trim()
        .toLowerCase()
        .replace(/&apos;/g, "'");

    let split = name.split('.');
    let craft = name.substr(1, 2) === "cr";

    collection = collection.replace(/=/g, '');

    return {
        "name": craft? split[0].substr(4) : split[0].substr(2),
        "collection": collection,
        "level": parseInt(name[0]),
        "animated": split[1] === 'gif',
        "craft": craft
    }
}

async function insertCrads(cards, collection) {
    if(cards.length == 0) return;

    var col = cards[0].collection;
    await collection.insert(cards);

    logger.message("> Inserted -- " + cards.length + " -- new cards from ["+ col +"] to DB");
}
