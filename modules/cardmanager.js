module.exports = {
    updateCardsLocal, updateCardsS3, updateCards_legacy
}

var mongodb;
const fs = require('fs');
const logger = require('./log.js');
const utils = require("./localutils.js");
const https = require('https');
const AWS = require('aws-sdk');
const settings = require('../settings/general.json');

const validExts = ['.png', '.gif', '.jpg'];
const acceptedExts = ['png', 'gif', 'jpg'];
const url = "https://amusementclub.nyc3.digitaloceanspaces.com";
const EP = new AWS.Endpoint("nyc3.digitaloceanspaces.com");
const s3 = new AWS.S3({
    endpoint: EP, 
    accessKeyId: settings.s3accessKeyId, 
    secretAccessKey: settings.s3secretAccessKey
});

function updateCardsLocal(connection, callback) {
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

function updateCards_legacy(connection) {
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

async function updateCardsS3(connection, callback) {
    console.log("[CardManager S3.5] Updating cards..."); 

    //cards/dragonmaid/1_Chinese_Dragon.png
    let allCards = [];
    (await connection.collection('cards').find().toArray())
        .map(card => allCards.push(getCardKey(card)));
    
    let res = await loadFilesFromS3(callback, allCards);
    await insertCrads(res, connection.collection('cards'));
    return res;
}      

function loadFilesFromS3(callback, allCards, marker, collected = []) {
    return new Promise(resolve => {
        let params = {Bucket: 'amusementclub', MaxKeys: 2000};

        if(marker)
            params.Marker = marker;

        s3.listObjects(params, async (err, data) => {
            if(err) console.log(err);

            let len = 0;
            data.Contents.map(object => {
                let item = object.Key.split('.')[0];
                let ext = object.Key.split('.')[1];
                if(ext && acceptedExts.includes(ext) &&
                    item.startsWith('cards') && !allCards.includes(item)){
                    let split = item.split('/');
                    if(split.length == 3) {
                        collected.push(getCardObject(split[2], split[1]));
                        len++;
                    }
                }
            });

            callback(len, collected.length);

            if (data.IsTruncated) {
                let marker = data.Contents[data.Contents.length - 1].Key;
                let res = await loadFilesFromS3(callback, allCards, marker, collected);
                return resolve(res);
            } else 
                resolve(collected);
        });
    });
}

function getCardKey(card) {
    let prefix = card.craft? card.level + 'cr' : card.level;
    return 'cards/' + card.collection + '/' + prefix + "_" + card.name;
}

async function getRemoteCardList() {
    return new Promise((resolve) => {

        https.get(url + '?max-keys=2000', (resp) => {
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
        .replace(/'/g, '')
        .trim()
        .toLowerCase()
        .replace(/&apos;/g, "");

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
