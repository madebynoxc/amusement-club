module.exports = {
    processRequest, connect
}

var mongodb, ucollection, tcollection;
const fs = require('fs');
const utils = require('./localutils.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection("users");
    tcollection = db.collection("transactions");
}

function processRequest(user, args, guild, callback) {
    if(!args || args.length == 0) return callback("**" + user.username + "**, please specify card queries separated by comma");
    
    ucollection.findOne({ discord_id: user.id }).then(dbUser => {
        var parse = utils.getUserID(args);

        tcollection.findOne({from_id: dbUser.discord_id, status: "pending", to_id: parse.id}).then((err, res) => {
            if(res) {
                var msg = "you already set up this transaction.\n";
                if(parse.id) msg += "Target user has to run `->confirm " + res.id + "` to confirm it.";
                else msg += "To confirm it run `->confirm " + res.id + "'"
                return callback(utils.formatError(dbUser, null, msg));
            }

            let transaction = {
                from: dbUser.username,
                from_id: dbUser.discord_id,
                status: "pending",
                guild: guild.name,
                guild_id: guild.id,
                time: new Date()
            }

            let queries = utils.getRequestFromFilters(parse.input);
            if(queries.length > 5) 
                return callback(utils.formatError(user, null, "you can't sell more than **5** cards at once!"));

            getUserCards({"discord_id": user.id, "$in": queries}).toArray((err, objs) => {
                if(!objs[0]) return callback(utils.formatError(user, "Can't find cards", "can't find any card matching that request"));

                let cards = objs[0].cards.filter(c => !(match.fav && match.amount == 1));
                transaction.cards = cards;
                //TODO id generator
                transaction.id = generateID();

                if(parse.id) {
                    ucollection.findOne({discord_id: parse.id}).then((err, resp) => {
                        if(!resp) return callback(ustils.formatError(user, "User not found", "can't find target user. Make sure they already have at least one card."));

                        transaction.to = resp.username;
                        transaction.to_id = parse.id;
                        
                        tcollection.insert(transaction).then((err, resp) => {
                            if(!err) return callback(formatSellRequest(transaction));
                        });

                    });
                } else {
                    cards.map(match => {
                        //TODO fav filtering
                        //if(match.fav && match.amount == 1) return callback(utils.formatError(user, null, "you can't sell favorite card." 
                        //    + " To remove from favorites use `->fav remove [card query]`"));
                        transaction.price = forge.getCardEffect(dbUser, 'sell', settings.cardprice[match.level - 1])[0];
                        
                    });

                    tcollection.insert(transaction).then((err, resp) => {
                        if(!err) return callback(formatSellRequest(transaction));
                    });
                }
            });


        });

    });
}

function getMassCardValue(cards) {
    ucollection.count({"cards":{"$in": utils.getCardQuery(cards)}}).then(amount => {
        let price = (ratioInc.star[card.level] 
                    + (card.craft? ratioInc.craft : 0) + (card.animated? ratioInc.gif : 0)) * 100;
        mongodb.collection('users').count({"lastdaily": { $exists: true }}).then(userCount => {
            price *= limitPriceGrowth((userCount * 0.035)/amount);
            callback(price);
        });
    });
}

function formatSellRequest(trans) {
    var msg = "**" + trans.from + "** wants to sell you:\n";
    trans.cards.map(c => {
        msg += "**" + utils.toTitleCase(c.name.replace(/_/, " ")) + "**\n";
    });
    msg += "** for **" + trans.price + "** tomatoes\n"
        + "To confirm use `->confirm " + trans.id + "`";

    return utils.formatWarning(trans.to, "Incoming transaction", msg);
}
