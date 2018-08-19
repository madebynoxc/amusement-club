module.exports = {
    processRequest, connect
}

var mongodb, bot;
const utils = require('./localutils');
const settings = require('../settings/general.json');

function connect(db, client) {
    mongodb = db;
    bot = client;
}

function processRequest(user, channelID, args, callback) {
    let command = args.shift();
    switch(command) {
        case 'embed':
            embed(args, callback);
            break;
    }
}

function embed(args, callback) {
    let link = args[0].replace('<', '').replace('>', '');
    console.log(utils.formatImage(null, null, "Formatted sample", link));
    
    callback(utils.formatImage(null, null, "Formatted sample", link));
}
