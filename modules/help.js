module.exports = {
    processRequest, processUserInput, connect
}

const logger = require('./log.js');
const utils = require('./localutils.js');
const _ = require("lodash");

const helpAll = require('../help/modules.json');
const settings = require('../settings/general.json');
const changelog = require('../help/updates.json');
const ai = require('../help/ai.json');

var mongodb, bot;

function connect(db, client) {
    mongodb = db;
    bot = client;
}

function processRequest(user, channel, args, callback) {
    var help;
    var req = args.shift();

    if(!req) help = helpAll[0];
    else help = helpAll.filter(h => h.type.includes(req))[0];

    if(help){ 
        sendDM(user.id, getEmbed(help));
        if(channel) callback("**" + user.username + "**, help was sent to you"); 
    }
    else if(channel) callback("Can't find module/command **" + req  + "**. Run `->help` to see the list");
}

function getEmbed(o) {
    let e = utils.formatInfo(null, o.title, o.description);
    e.thumbnail = { url: "https://i.imgur.com/zCsJQVm.jpg" };
    e.fields = [];
    o.fields.map((element) => {
       e.fields.push({ name: element.title, value: element.description }); 
    }, this);
    e.footer = { text: "Amusement Club | kqgAvdX | v" + changelog[0].version + " | by NoxCaos#4905" };
    return e;
}

function processUserInput(inp, author, callback) {
    if(inp.startsWith('how') || inp.endsWith('?')) {
        let collection = mongodb.collection('users');
        collection.findOne({ discord_id: author.id }).then(dbUser => {
            if(!dbUser || !dbUser.cards || dbUser.cards.length < 30) {
                ai.modules.forEach((e) => {
                    if(inp.includes(e.key)) {
                        res = _.sample(ai.answers);
                        res = res.replace("{user}", author.username);
                        res = res.replace("{module}", e.name);
                        res = res.replace("{command}", e.key);
                        callback(res);
                        return;
                    }
                }, this);
            }
        });
    }
}

function sendDM(toID, embed) {
    bot.createDMChannel(toID, (createErr, newChannel) => {
        bot.sendMessage({to: newChannel.id, embed: embed}, 
            (err, resp) => {
            if(err) {
                console.error("[Help] Failed to send message to created DM channel");
                console.error(err);
            }
        });
    });
}
