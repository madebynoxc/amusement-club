module.exports = {
    processRequest
}

const Discord = require("discord.js");
const logger = require('./log.js');
const utils = require('./localutils.js');
const helpBody = require('../help/general.json');
const helpAll = require('../help/modules.json');
const settings = require('../settings/general.json');

function processRequest(message, args, callback) {
    var req = args.shift();
    if(req) {
        var help = helpAll.filter(h => h.type.includes(req))[0];
        if(help) {
            message.author.send("__**" + help.title + "**__\n\n" + help.body);
            if(message.channel.name) 
                callback("**" + message.author.username + "**, I've sent you a DM");
        } 
        else callback("Can't find help inforamtion for " + req);
    } else showGeneral(message, callback);
}

function showGeneral(message, callback) {
	let e = new Discord.RichEmbed();
    e.setColor(settings.botcolor);
    e.setAuthor(helpBody.title)
    helpBody.fields.forEach(function(element) {
       e.addField(element.title, element.description, false); 
    }, this);

    message.author.send("", { embed: e });
    if(message.channel.name) 
        callback("**" + message.author.username + "**, I've sent you a DM");
}