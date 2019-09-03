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

function processRequest(user, channel, args, prefix, callback) {
    var help;
    var req = args.shift();

    if(!req) help = helpAll[0];
    else help = helpAll.filter(h => h.type.includes(req))[0];

    if(help)
        sendDM(user, getEmbed(help, prefix), channel, callback);

    else if(channel) 
        callback("Can't find module/command **" + req  + "**. Run `" + prefix + "help` to see the list");
}

function getEmbed(o, prefix) {
    let e = utils.formatInfo(null, o.title, o.description.replace(/->/g, prefix));
    e.thumbnail = { url: "https://i.imgur.com/zCsJQVm.jpg" };
    e.fields = [];
    o.fields.map((element) => {
       e.fields.push({ name: element.title, value: element.description.replace(/->/g, prefix)}); 
    }, this);
    e.footer = { text: "Amusement Club | xQAxThF | v" + changelog[0].version + " | by NoxCaos#4905" };
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

function sendDM(user, embed, channel, callback) {
    bot.createDMChannel(user.id, (createErr, newChannel) => {
        if(!newChannel)
            return callback(utils.formatError(user, "Can't send you messages", "please, make sure you have **Allow direct messages from server members** enabled in server privacy settings"));
        
        bot.sendMessage({to: newChannel.id, embed: embed}, 
            (err, resp) => {
            if(channel){
                if(err) 
                    callback(utils.formatError(user, "Can't send you messages", "please, make sure you have **Allow direct messages from server members** enabled in server privacy settings"));
                else callback("**" + user.username + "**, help was sent to you"); 
            }
        });
    });
}
