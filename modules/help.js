module.exports = {
    processRequest
}

const Discord = require("discord.js");
const logger = require('./log.js');
const utils = require('./localutils.js');
const helpAll = require('../help/modules.json');
const settings = require('../settings/general.json');
const changelog = require('../help/updates.json');

function processRequest(message, args, callback) {
    var req = args.shift();
    if(req) {
        var help = helpAll.filter(h => h.type.includes(req))[0];
        if(help) {
            message.author.send("", { embed: getEmbed(help) });
            if(message.channel.name) 
                callback("**" + message.author.username + "**, wait, what was that sound?");
        } 
        else callback("Can't find module/command **" + req  + "**. Run `->help` to see the list");
    } else showGeneral(message, callback);
}

function showGeneral(message, callback) {
    message.author.send("", { embed: getEmbed(helpAll[0]) });
    if(message.channel.name) 
        callback("**" + message.author.username + "**, look! A new message! I wonder what it is about");
}

function getEmbed(o) {
    let e = new Discord.RichEmbed();
    e.setColor('#FF7440');
    e.setTitle(o.title);
    e.setThumbnail("https://i.imgur.com/gIJ4LYm.jpg");
    e.setDescription(o.description);
    o.fields.forEach((element) => {
       e.addField(element.title, element.description, false); 
    }, this);
    e.setFooter("Amusement Club | kqgAvdX | v" + changelog[0].version + " | by NoxCaos#4905");
    return e;
}