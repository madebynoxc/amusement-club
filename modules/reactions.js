module.exports = {
    setupPagination
}

var paginations = [];
const dbManager = require("./dbmanager.js");

function setupPagination(message, author) {
    resetReact(message);
    
    paginations.push({"id": message.id, "page": 1, "user": author.id, "tier": 0})
    var collector = message.createReactionCollector(
        (reaction, user) => user.username === author.username,
        { time: 300000 }
    );
    collector.on('collect', r => {
        message.clearReactions();
        processEmoji(r.emoji.name.trim(), message);
    });
    collector.on('end', collected => {
        message.clearReactions();
        //paginations.
    });
}

function processEmoji(e, message) {
    var pgn = paginations.filter((o)=> o.id == message.id)[0];
    switch(e) {
        case '⬅':
            if(pgn.page > 1 ) {
                pgn.page--;
                dbManager.getCards(pgn.user, pgn.tier, (cnt)=>{
                    console.log(cnt);
                    if(cnt) message.edit(cnt);
                }, pgn.page);
            }
            break;
        case '➡':
            pgn.page++;
            dbManager.getCards(pgn.user, pgn.tier, (cnt)=>{
                if(cnt) message.edit(cnt);
                console.log(cnt);
            }, pgn.page);
            break;
    }
    //resetReact(message);
}

function resetReact(message) {
    //message.clearReactions();
    setTimeout(()=> message.react("⬅"), 500);
    setTimeout(()=> message.react("➡"), 100);
}