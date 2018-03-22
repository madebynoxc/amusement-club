module.exports = {
    processRequest
}

var mongodb, ucollection, tagcollection;
const fs = require('fs');
const logger = require('./log.js');

function connect(db) {
    mongodb = db;
    ucollection = db.collection('users');
    ccollection = db.collection('cards');
    tagcollection = db.collection('tags');
}

function processRequest(userID, args, callback) {
    ucollection.findOne({ discord_id: userID }).then((dbUser) => {
        if(!dbUser) return;

        var req = args.shift();
        switch(req) {
            case "list":
                listTags(args.join('_'), callback);
                break;
            case "add":
                addTag(dbUser, args, callback);
                break;
            case "down":
                downVote(dbUser, args, callback);
                break;
            case "get":
                getCards(dbUser, args, callback);
                break;
        }
    });
}

function listTags(cardname, callback) {

}

function addTag(user, args, callback) {
    let tag, cardsearch = [];
    args.map(a => {
        if(a[0] == '#')
            tag = a.substr(1);
        else cardsearch.push(a);
    });

    if(!tag || cardsearch.length == 0)
        return callback(utils.formatError(user, null, "you have to pass card query and #tag you want to assign"));

    let query = utils.getRequestFromFiltersNoPrefix(args);
    ccollection.find(query).toArray((err, res) => {
        let match = query.name? getBestCardSorted(res, query.name)[0] : res[0];
        if(!match) return callback(utils.formatError(user, null, "no cards found that match your request"));

        tagcollection.findOne({name: tag, card: query}).then(dbtag => {
            if(dbtag) {
                var curVoter = dbtag.votes.filter(v => v.id == user.discord_id);
                if(curVoter.length > 0) {
                    if(curVoter[0].res == 1)
                        return callback(utils.formatError(user, null, "you already upvoted this tag"));
                    curVoter.res = 1;
                    
                } else {
                    tagcollection.update({name: tag, card: query}, {$push: {votes: {id: user.discord_id, res: 1}}}).then(() => {
                        callback(utils.formatInfo(user, null, "you upvoted tag **#" + tag + "** for **" + match.name + "**"));
                    });
                }
            } else {
                ccollection.update(query, {$push: {tags: tag}}).then(() => {
                    match.tags = null;
                    var newTag = {
                        name: tag,
                        author: user.discord_id,
                        card: match,
                        votes: [{id: user.discord_id, res: 3}]
                    }
                    tagcollection.push(newTag).then(() => { 
                        callback(utils.formatInfo(user, null, "you assigned tag **#" + tag + "** to **" + match.name + "**"));
                    });
                });
            }
        });
    });
}

function downVote(user, args, callback) {

}

function getCards(user, tag, callback) {

}