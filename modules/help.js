module.exports = {

}

const Discord = require("discord.js");
const logger = require('./log.js');
const utils = require('./localutils.js');
const helpBody = require('../help/general.json');

function processRequest(message, args, callback) {
    var req = args.shift();
    if(req) {
    	
    } else showGeneral(message);
}

function showGeneral(message) {
	let e = new Discord.RichEmbed();
    e.setColor(settings.botcolor);
    e.setAuthor(helpBody.title)
    helpBody.fields.forEach(function(element) {
       e.addField(element.title, element.description, false); 
    }, this);

    message.author.send("", { embed: e });

    if(message.channel.name) return "**" + message.author.username + "**, I've sent you a DM";
}