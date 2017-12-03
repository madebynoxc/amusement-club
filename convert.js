const MongoClient = require('mongodb').MongoClient;
const utils = require('./modules/localutils.js');
const settings = require('./settings/general.json');

MongoClient.connect(settings.database, function(err, db) {
    console.log("Connected correctly to database");

    db.collection('users').find({}).toArray((err, res) => {
        let count = 0;
        res.map(user => {
            let list = [];
            if(user.cards) {
                user.cards.map(card => {
                    if(!card.amount) card.amount = 1;

                    let dupe = utils.containsCard(list, card);
                    if(dupe) dupe.amount++;
                    else list.push(card);
                });

                db.collection('users').update(
                    { discord_id: user.discord_id },
                    { $set: { cards: list } }
                ).then(() => {
                    console.log("User " + user.username + " was updated");
                });
                count++;
            }
        });

        console.log("Finished sending requests to " + count + " users");
    });
});

