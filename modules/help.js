module.exports = {
    processRequest, processUserInput, connect
}

const Discord = require("discord.js");
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

    bot.createDMChannel(user.id, (err, res) => {
        if(err && channel) {
            callback("**" + user.username 
                + "**, can't send you a message. Please, allow direct messages from server members in privacy settings");
        }
        else if(!err) {
            if(help) bot.sendMessage({to: res.id, embed: getEmbed(help)});
            else bot.sendMessage({to: res.id, message: "Can't find module/command **" + req  + "**. Run `->help` to see the list" });

            if(channel) callback("**" + user.username + "**, help was sent to you"); 
        }
    });
}

function getEmbed(o) {
    let e = new Discord.RichEmbed();
    e.setColor('#E37787');
    e.setTitle(o.title);
    e.setThumbnail("https://i.imgur.com/gIJ4LYm.jpg");
    e.setDescription(o.description);
    o.fields.forEach((element) => {
       e.addField(element.title, element.description, false); 
    }, this);
    e.setFooter("Amusement Club | kqgAvdX | v" + changelog[0].version + " | by NoxCaos#4905");
    return e;
}

function processUserInput(inp, author, callback) {
    if(inp.startsWith('how') || inp.endsWith('?')) {
        let collection = mongodb.collection('users');
        collection.findOne({ discord_id: author.id }).then(dbUser => {
            if(!dbUser.cards || dbUser.cards.length < 30) {
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
