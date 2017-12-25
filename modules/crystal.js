module.exports = {
    getCrystals, connect, forgeCrystals, getRecipe
}

var mongodb, ucollection, ccollections;
const _ = require("lodash");
const utils = require('./localutils.js');
const dbManager = require("./dbmanager.js");
const crystcol = require("../crystals/list.json");

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    ccollection = db.collection('promocards');
}

function getRecipe(user, args, callback) {
    if(!args || args.length == 0) return;

    var mode = "";
    for(i in args) {
        if(args[i].includes("*")){
            if(mode == "card")
                return callback("**" + user.username + "**, use crystal list (with * before names) OR card name to get recipes");
            mode = "cryst";
        }
        else {
            if(mode == "cryst")
                return callback("**" + user.username + "**, use crystal list (with * before names) OR card name to get recipes");
            mode = "card";
        }
    }

    if(mode == "cryst") {
        if(args.length < 3)
            return callback("**" + user.username + "**, minimum **3** crystals requirede for recipe");

        var hash = utils.toTitleCase(args.join(' ')).replace(/\s/g, ".");
        ccollection.findOne({"recipe.hash": hash.replace(/(\*|,)/g, "")}).then(card => {
            if(card){
                let stars = "";
                for(let i=0; i<parseInt(card.level); i++)
                    stars += "★"; 
                return callback("**" + user.username + "**, you will get **[" +
                stars + "] " + utils.toTitleCase(card.name.replace(/_/g, " ")) + "** if you use this recipe");
            } 
            return callback("**" + user.username + "**, no card found with that recipe. It will be assigned to a random card when you forge these crystals");
        });
    } else {
        let query = utils.getRequestFromFiltersNoPrefix(args);
        console.log(query);
        ccollection.findOne(query).then(card => {
            if(card){
                if(card.recipe) return callback("**" + user.username + "**, the recipe for this card is `" 
                    + card.recipe.hash.replace(/\./g, " ") + "` (order sensitive)");
                return callback("**" + user.username + "**, no recipe assigned to this card.");
            }
            return callback("**" + user.username + "**, card with that name was not found");
        });
    }
}

function getCrystals(user, cards, callback) {
    let passed = [];
    let levels = 0;
    for(i in cards) {
        levels += cards[i].level;

        if(passed.includes(cards[i].name)) {
            callback("**" + user.username + "**, you can't use cards with same name!");
            return;
        }

        if(cards[i].collection != "christmas") {
            callback("**" + user.username + "**, you can use only **Christmas** cards!");
            return;
        }

        passed.push(cards[i].name);
    }

    let cost = -levels * 35;
    if(user.promoexp < cost)
        return callback("**" + user.username + "**, you need **" + cost + "** Snowflakes to forge those cards. You have only **" + user.promoexp + "**");

    if(levels > 6) levels = 6;
    var cryst = _.sample(crystcol.filter(x => (x.value <= levels && x.value >= levels - 2)));
    for(j in cards) {
        let match = utils.containsCard(user.cards, cards[j]);
        if(match) user.cards = dbManager.removeCardFromUser(user.cards, match);
    }

    addToInventory(user, cryst);
    ucollection.update( 
        { discord_id: user.discord_id},
        { 
            $set: {cards: user.cards, inventory: user.inventory },
            $inc: {promoexp: -cost}
        }
    ).catch(e => {logger.error(e)});

    callback("**" + user.username + "**, you got **" + cryst.name + 
        " crystal**!\nCombine three or more crystals in a forge to get a 3+ star card!",
                        "./crystals/" + cryst.file + ".png");
}

function forgeCrystals(user, list, callback) {
    if(!user.inventory || user.inventory.length == 0) 
        return callback("**" + user.username + "**, your inventory is **empty**");

    if(list.length < 3)
        return callback("**" + user.username + "**, minimum **3** crystals required");

    let value = 0;
    let minlevel = 2;
    let platCount = 0;
    let arr = [];
    for(i in list) {
        let name = list[i].replace(/(_|\*)/gi, "");
        let item = user.inventory.filter(c => (c.name.toLowerCase().includes(name) && c.type === "crystal"))[0];
        if(!item) return callback("**" + user.username + "**, you don't have crystal named **" + name + "**");
        if(item.amount == 0) return callback("**" + user.username + "**, you don't have enough **" + name + "** crystals");

        value += item.value;
        if(item.name == "Cyan" || item.name == "Magenta") minlevel = 3;
        else if (item.name == "Gold") minlevel = 4;
        else if (item.name == "Platinum") {
            minlevel = 4;
            platCount++;
        }
        item.amount--;
        arr.push(item.name);
    }

    ccollection.findOne({"recipe.hash": arr.join('.')}).then(card => {
        var text = "**" + user.username + "**, ";
        if(!card) {
            let maxlevel = Math.min(minlevel + 2, 5);
            let query = [ 
                { $match: { level: {$gte: minlevel, $lt: maxlevel}, "recipe.hash": { $exists: false } } },
                { $sample: { size: 1 } } 
            ];

            if(platCount >= 3) query = [{$match: {level: 5}}, {$sample: {size: 1}}];

            ccollection.aggregate(query).toArray((err, cards) => {
                card = cards[0];
                if(!card)
                    return callback("**" + user.username + "**, all recipes were assigned. Use `->res [*crystal1, *crystal2, ...]` to get possible cards from your crystals");
                ccollection.update(
                    {level: card.level, name: card.name},
                    {
                        $set: {recipe: {hash: arr.join('.'), creator: user.discord_id, usage: 0}}
                    });
                text += "you assigned new recipe to card: `" + arr.join(' ') + "`. You will get extra snowflakes every time someone crafts this card\n";
                text += "You are the first person who got card **" + utils.toTitleCase(card.name.replace(/_/g, " ")) + "**!";

                dbManager.addCardToUser(user.cards, card);
                ucollection.update(
                    { discord_id: user.discord_id },
                    {
                        $set: {cards: user.cards, inventory: user.inventory}
                    }
                );

                callback(text, dbManager.getCardFile(card));
            });
        } else {
            text += "you crafted **" + utils.toTitleCase(card.name.replace(/_/g, " ")) + "**!";
            if(card.recipe.creator != user.discord_id) {
                ucollection.update(
                    { discord_id: card.recipe.creator },
                    {
                        $inc: {promoexp: 100 * card.level}
                    }
                );
                ccollection.update(
                    {level: card.level, name: card.name},
                    { $inc: {usage: 1}});
            }

            dbManager.addCardToUser(user.cards, card);
            ucollection.update(
                { discord_id: user.discord_id },
                {
                    $set: {cards: user.cards, inventory: user.inventory}
                }
            );

            callback(text, dbManager.getCardFile(card));
        }
    }).catch(e => console.log(e));
}

function addToInventory(user, item) {
    if(!user.inventory) user.inventory = [];
    var match = user.inventory.filter(i => i.name == item.name);
    if(match[0]) {
        match[0].amount++;
    } else user.inventory.push(item);
}