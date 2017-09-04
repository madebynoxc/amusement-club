module.exports = {
    processRequest
}

var mongodb, ucollection, tagcollection;
const fs = require('fs');
const logger = require('./log.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    tagcollection = db.collection('tags');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case "list":
                listTags(args.join('_'), callback);
                break;
            case "add":
                addTag(dbUser, args, callback);
                break;
            case "down":
                downVote(dbUser, args, callback);
                break;
            case "get":
                getCards(dbUser, args, callback);
                break;
        }
    });
}

function listTags(cardname, callback) {

}

function addTag(user, args, callback) {

}

function downVote(user, args, callback) {

}

function getCards(user, tag, callback) {

}