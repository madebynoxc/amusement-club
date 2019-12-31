module.exports = {
    processRequest, connect
}

const utils = require('./localutils.js');
const _ = require("lodash");

var mongodb, bot;

function connect(db, client) {
    mongodb = db;
    bot = client;
}

function processRequest(user, args, callback) {
    mongodb.collection("users").findOne({discord_id: user.id}).then(dbUser => {
        if(!dbUser)
            return;

        mongodb.collection("votes").find({user: user.id}).then(votes => {
            if(votes && votes.length > 0)
                return callback(utils.formatConfirm(user, null, "thank you for voting! We got **" + votes.length + "** votes from you in total"));
            else return callback(utils.formatError(user, null, "the voting for 2019 has been closed"));
        })
    });
}
